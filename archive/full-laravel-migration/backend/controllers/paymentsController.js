// ---------------------------------------------------------------------
// Payments controller
//   - getPaymentInstructions : GET  /api/bookings/:bookingCode/payment-instructions
//   - createProofUploadUrl   : POST /api/bookings/:bookingCode/payment-proof/signed-url
//   - recordPaymentProof     : POST /api/bookings/:bookingCode/payment-proof
//
// The file itself is uploaded by the browser directly to S3-compatible storage
// using the signed URL — it never touches this server. Business rules live
// in lib/payments.js so the verify state machine is shared with admin review.
// ---------------------------------------------------------------------
const paymentProofRepository = require('../repositories/paymentProofRepository');
const { config } = require('../lib/config');
const { fareBreakdown, payableAmount, bookingVat } = require('../lib/fare');
const { addTrackingEvent } = require('../lib/tracking');
const { verifyBookingPayment } = require('../lib/payments');
const { pushBookingStatus, pingAdmin } = require('../lib/realtime');
const { getStcPayEnabled } = require('../lib/settings');
const {
  buildProofPath,
  createProofUploadUrl,
} = require('../lib/storage');

// Statuses from which a passenger is still allowed to (re)submit a proof.
const PAYABLE_STATUSES = ['awaiting_proof', 'proof_uploaded', 'under_review', 'rejected'];

async function loadBooking(bookingCode) {
  return paymentProofRepository.bookingForPayment(bookingCode);
}

// Cash rides pay the driver at pickup — none of the online STC Pay proof
// endpoints apply. The frontend never calls them for cash, so this is a
// defensive 409 for a mismatched client.
function cashBlocked(res, booking) {
  if (booking.payment_method === 'cash') {
    res.status(409).json({ error: 'This booking is cash on delivery — no online payment is needed' });
    return true;
  }
  return false;
}

// --- Increment 1 -----------------------------------------------------
async function getPaymentInstructions(req, res) {
  try {
    const booking = await loadBooking(req.params.bookingCode);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (cashBlocked(res, booking)) return;

    const stcPayAvailable = await getStcPayEnabled();

    // Breakdown runs on the EX-VAT fare; VAT is a separate snapshot line.
    const fare = fareBreakdown(booking.fare_amount);
    const vatAmount = bookingVat(booking);
    const payable = payableAmount(booking);

    return res.json({
      bookingCode: booking.booking_code,
      paymentMethod: booking.payment_method,
      paymentStatus: booking.payment_status,
      // What to transfer: fare + VAT.
      amount: payable,
      currency: booking.currency,
      // Itemized: base + 3.75% service fee = fare, + VAT = total.
      fare: {
        base: fare.base,
        serviceFeeRate: fare.serviceFeeRate,
        serviceFeePercent: +(fare.serviceFeeRate * 100).toFixed(2),
        serviceFee: fare.serviceFee,
        fareTotal: fare.total,
        vatAmount,
        vatRate: Number(booking.vat_rate) || 0,
        vatPercent: +((Number(booking.vat_rate) || 0) * 100).toFixed(2),
        total: payable,
        currency: fare.currency,
      },
      // Manual STC Pay transfer, which a super admin can retire from the
      // admin portal once card is settling reliably (0044). The details and
      // the instructions are withheld together with the flag - leaving the
      // account number in a response the UI no longer renders is how a
      // retired payment method comes back through a stale client.
      stcPayAvailable,
      stcPay: stcPayAvailable
        ? {
            number: config.stcPay.number,
            recipientName: config.stcPay.recipientName,
          }
        : null,
      // The booking code IS the transfer note so we can match the payment.
      reference: booking.booking_code,
      // Whether to offer the card option at all. Only the PUBLIC key is
      // ever sent — the secret is what gates availability server-side.
      cardAvailable: !!config.tap.secretKey,
      tapPublicKey: config.tap.publicKey || null,
      applePayEnabled: !!config.tap.applePayEnabled,
      instructions: stcPayAvailable
        ? [
            `Open STC Pay and send ${payable} ${booking.currency} to ${config.stcPay.number} (${config.stcPay.recipientName}).`,
            `Put your booking code ${booking.booking_code} in the transfer note.`,
            'Take a screenshot of the successful transfer.',
            'Upload that screenshot as your payment proof to confirm your booking.',
          ]
        : [],
      testMode: config.autoVerifyTestMode,
    });
  } catch (err) {
    console.error('getPaymentInstructions error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Increment 2a: hand the client a signed upload URL ---------------
async function createProofUploadUrlHandler(req, res) {
  try {
    const booking = await loadBooking(req.params.bookingCode);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (cashBlocked(res, booking)) return;
    if (!PAYABLE_STATUSES.includes(booking.payment_status)) {
      return res.status(409).json({
        error: `Payment already ${booking.payment_status}; a new proof cannot be uploaded`,
      });
    }

    const { file_name, mime_type } = req.body || {};
    if (!mime_type || !config.proofs.allowedMimeTypes.includes(mime_type)) {
      return res.status(400).json({
        error: `mime_type is required and must be one of: ${config.proofs.allowedMimeTypes.join(', ')}`,
      });
    }

    const path = buildProofPath(booking.booking_code, file_name);
    const { token, signedUrl } = await createProofUploadUrl(path);

    return res.status(201).json({
      bucket: config.proofs.bucket,
      path,
      token,
      signedUrl,
      maxBytes: config.proofs.maxBytes,
      // After uploading, the client POSTs back to /payment-proof with this path.
      next: `/api/bookings/${booking.booking_code}/payment-proof`,
    });
  } catch (err) {
    console.error('createProofUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

// --- Increment 2b: record the uploaded proof (+ test auto-verify) -----
async function recordPaymentProof(req, res) {
  try {
    const booking = await loadBooking(req.params.bookingCode);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (cashBlocked(res, booking)) return;
    if (!PAYABLE_STATUSES.includes(booking.payment_status)) {
      return res.status(409).json({
        error: `Payment already ${booking.payment_status}; a new proof cannot be recorded`,
      });
    }

    const b = req.body || {};
    const errors = [];
    if (!b.path) errors.push('path is required (returned by the signed-url step)');
    if (!String(b.path || '').startsWith(`${booking.booking_code}/`)) {
      errors.push('path does not belong to this booking');
    }
    if (b.size_bytes != null && Number(b.size_bytes) > config.proofs.maxBytes) {
      errors.push(`file exceeds max size of ${config.proofs.maxBytes} bytes`);
    }
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const proof = await paymentProofRepository.record({ booking, proof: b });

    await addTrackingEvent(booking.id, {
      eventType: 'proof_uploaded',
      title: 'Payment proof uploaded',
      message: 'We received your payment proof. It is now under review.',
    });

    pushBookingStatus(booking.booking_code, {
      paymentStatus: 'proof_uploaded',
      bookingStatus: 'payment_under_review',
    });
    pingAdmin(booking.booking_code);

    if (config.autoVerifyTestMode) {
      const { booking: verified, error: verifyErr } = await verifyBookingPayment({
        booking,
        mode: 'test_auto',
        proofId: proof.id,
      });
      if (verifyErr) {
        console.error('recordPaymentProof auto-verify error:', verifyErr);
        return res.status(500).json({ error: 'Proof saved but auto-verify failed' });
      }
      return res.status(201).json({
        bookingCode: verified.booking_code,
        proofId: proof.id,
        paymentStatus: verified.payment_status,
        bookingStatus: verified.booking_status,
        autoVerified: true,
      });
    }

    return res.status(201).json({
      bookingCode: booking.booking_code,
      proofId: proof.id,
      paymentStatus: 'proof_uploaded',
      bookingStatus: 'payment_under_review',
      autoVerified: false,
    });
  } catch (err) {
    console.error('recordPaymentProof error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = {
  getPaymentInstructions,
  createProofUploadUrl: createProofUploadUrlHandler,
  recordPaymentProof,
};
