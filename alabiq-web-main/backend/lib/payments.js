// ---------------------------------------------------------------------
// Payment verification state machine (spec §9).
//
// Both paths converge here so the status transitions are defined ONCE:
//   - test auto-verify (proof upload, AUTO_VERIFY_STCPAY_TEST_MODE=true)
//   - admin manual verify / reject
//
// ---------------------------------------------------------------------
const database = require('./database/pool');
const { addTrackingEvent } = require('./tracking');
const { pushBookingStatus, pingAdmin } = require('./realtime');
const { payableAmount } = require('./fare');

// mode is a verification_mode enum value:
//   'test_auto' | 'admin_manual' | 'gateway_webhook'
//
// gateway_webhook is the card path: Tap confirmed the charge, so there is
// no human in the loop and no proof to review — the booking is verified and
// confirmed straight away, which is what starts the driver dispatch below.
// provider/gateway carry the Tap details onto the payments row.
async function verifyBookingPayment({
  booking,
  mode,
  adminId = null,
  proofId = null,
  manualReference = null,
  provider = 'stcpay_manual',
  gateway = null,
}) {
  const now = new Date().toISOString();
  // Both the test auto-verify and a gateway webhook are machine-verified;
  // only admin_manual has a human behind it.
  const verifiedBySystem = mode !== 'admin_manual';

  let updated;
  try {
    updated = await database.transaction(async (client) => {
      await client.query(
        `INSERT INTO public.payments(booking_id,provider,amount,currency,status,manual_reference,
         verified_by_admin_id,verified_by_system,verification_mode,verified_at,gateway_provider,
         gateway_payment_id,gateway_reference,gateway_status,gateway_raw)
         VALUES($1,$2,$3,$4,'verified',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [booking.id,provider,payableAmount(booking),booking.currency,manualReference,adminId,
          verifiedBySystem,mode,now,gateway ? provider : null,gateway ? gateway.paymentId : null,
          gateway ? booking.booking_code : null,gateway ? gateway.status : null,
          gateway ? (gateway.raw || null) : null],
      );

      if (proofId) {
        await client.query(
          `UPDATE public.payment_proofs SET status='verified',verification_mode=$2,admin_reviewer_id=$3,
           reviewed_at=$4,test_auto_verified_at=$5 WHERE id=$1`,
          [proofId,mode,adminId,now,verifiedBySystem ? now : null],
        );
      }
      const { rows } = await client.query(
        `UPDATE public.bookings SET payment_status='verified',booking_status='confirmed',
         verification_mode=$2,confirmed_at=$3,test_auto_verified_at=$4 WHERE id=$1
         RETURNING booking_code,payment_status,booking_status,verification_mode,confirmed_at`,
        [booking.id,mode,now,verifiedBySystem ? now : null],
      );
      if (!rows[0]) throw new Error('Booking not found while confirming payment');
      return rows[0];
    });
  } catch (payErr) {
    // 23505 on uq_payments_gateway_payment_id (0006) means this charge is
    // already recorded — a replayed webhook, or the synchronous confirm and
    // the webhook racing. Both are successes, not errors.
    if (payErr.code === '23505') return { alreadyVerified: true };
    return { error: payErr };
  }

  await addTrackingEvent(booking.id, {
    eventType: mode === 'admin_manual' ? 'payment_verified' : 'auto_verified',
    title: 'Payment verified',
    message:
      mode === 'gateway_webhook'
        ? 'Your card payment went through. Your booking is confirmed.'
        : mode === 'test_auto'
          ? 'Your payment was auto-verified (test mode). Your booking is confirmed.'
          : 'Your payment has been verified. Your booking is confirmed.',
    createdByUserId: adminId,
  });

  // Realtime: confirm to the passenger, then dispatch Grab-style — the
  // nearest online driver gets an exclusive 30s offer (lib/dispatch.js);
  // the old broadcast-to-all feed is the fallback when nobody is online.
  pushBookingStatus(booking.booking_code, {
    paymentStatus: 'verified',
    bookingStatus: 'confirmed',
  });
  // Lazy require: dispatch depends on realtime/geo and payments is loaded early.
  const { startRideDispatch } = require('./dispatch');
  startRideDispatch(booking.id);

  return { booking: updated };
}

async function rejectBookingPayment({ booking, adminId = null, reason = null, proofId = null }) {
  const now = new Date().toISOString();

  let updated;
  try {
    updated = await database.transaction(async (client) => {
      if (proofId) {
        await client.query(
          `UPDATE public.payment_proofs SET status='rejected',admin_reviewer_id=$2,
           reviewed_at=$3,rejection_reason=$4 WHERE id=$1`, [proofId,adminId,now,reason]);
      }
      const { rows } = await client.query(
        `UPDATE public.bookings SET payment_status='rejected',booking_status='pending_payment'
         WHERE id=$1 RETURNING booking_code,payment_status,booking_status`, [booking.id]);
      if (!rows[0]) throw new Error('Booking not found while rejecting payment');
      return rows[0];
    });
  } catch (error) {
    return { error };
  }

  await addTrackingEvent(booking.id, {
    eventType: 'payment_rejected',
    title: 'Payment rejected',
    message: reason
      ? `Your payment proof was rejected: ${reason}. Please upload a valid proof.`
      : 'Your payment proof was rejected. Please upload a valid proof.',
    createdByUserId: adminId,
  });

  // Realtime: tell the passenger to re-upload; refresh the admin board.
  pushBookingStatus(booking.booking_code, {
    paymentStatus: 'rejected',
    bookingStatus: 'pending_payment',
  });
  pingAdmin(booking.booking_code);

  return { booking: updated };
}

module.exports = { verifyBookingPayment, rejectBookingPayment };
