// ---------------------------------------------------------------------
// Card payments — the Tap webhook (all three verticals) and the rides
// charge endpoint.
//
//   - tapWebhook               : POST /api/payments/webhooks/tap
//   - createBookingCardCharge  : POST /api/payments/bookings/:code/charge
//
// The webhook is the platform's single source of truth for card payments.
// It replaced two per-vertical copies whose signature check could never
// have matched a real Tap webhook (they HMAC'd JSON.stringify(body); Tap
// signs a concatenation of named fields — see lib/tap.js).
// ---------------------------------------------------------------------
const crypto = require('crypto');

const tap = require('../lib/tap');
const webhookRepository = require('../repositories/webhookRepository');
const gatewayPaymentRepository = require('../repositories/gatewayPaymentRepository');
const { chargeForOrder, respondToCharge } = require('../lib/cardCharge');
const { confirmGatewayPayment, findByChargeId } = require('../lib/gatewayPaid');
// Deciding what a charge means, and settling the order against it, is shared
// with verify-on-return and the sweeper — see lib/chargeReconcile.js. Three
// copies of "has this been paid" is three ways to disagree about money.
const { settleCharge } = require('../lib/chargeReconcile');

// Ride bookings the passenger may still pay for.
const PAYABLE_BOOKING_STATUSES = ['awaiting_proof', 'proof_uploaded', 'under_review', 'rejected'];

// Keep the audit trail useful without persisting card references. Anything
// not named here is dropped — in particular `card` and `source`, which
// carry the masked PAN and the saved card id.
function redactWebhookPayload(body) {
  const b = body || {};
  return {
    id: b.id || null,
    status: b.status || null,
    amount: b.amount ?? null,
    currency: b.currency || null,
    reference: b.reference || null,
    metadata: b.metadata || null,
    created: (b.transaction && b.transaction.created) || null,
  };
}

async function recordWebhookEvent({ body, signatureVerified }) {
  return webhookRepository.create({
    body: redactWebhookPayload(body), signatureVerified,
    payloadHash: crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex'),
  });
}

async function finishWebhookEvent(eventId, patch) {
  return webhookRepository.finish(eventId, patch);
}

async function tapWebhook(req, res) {
  let eventId = null;
  try {
    // 1. Fail closed. With no key configured no legitimate Tap webhook can
    //    exist, so an unsigned "CAPTURED" must never be trusted — otherwise
    //    a POST with a guessed order code marks that order paid for free.
    if (!tap.tapConfigured()) {
      return res.status(503).json({ error: 'Card payment is not configured' });
    }

    const body = req.body || {};

    // 2. Verify Tap's hashstring: HMAC-SHA256 over the x_id/x_amount/...
    //    field concatenation, keyed with the secret API key, compared in
    //    constant time.
    const signatureVerified = tap.verifyWebhookHash(body, req.get('hashstring'));

    // 3. Log the attempt either way. A run of signature_verified = false
    //    rows is the only signal we would ever get that someone is probing
    //    this endpoint.
    eventId = await recordWebhookEvent({ body, signatureVerified });
    if (!signatureVerified) {
      await finishWebhookEvent(eventId, { verified_by_fetch: false });
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const chargeId = body.id;
    if (!chargeId) {
      await finishWebhookEvent(eventId, { verified_by_fetch: false });
      return res.status(400).json({ error: 'Malformed webhook' });
    }

    // 4-6. Verify by fetch, then settle. The hash proves the message came
    //      from Tap; only Tap's own record of the charge proves what
    //      actually happened, so the posted status, amount and order code
    //      are never acted on. settleCharge does all of that, and the same
    //      call backs verify-on-return and the sweeper.
    const settled = await settleCharge(chargeId);

    if (!settled.ok && settled.reason === 'fetch_failed') {
      // Tap retries on a non-2xx, and a transient fetch failure is exactly
      // the case where a retry helps.
      await finishWebhookEvent(eventId, { verified_by_fetch: false });
      return res.status(502).json({ error: 'Could not verify the charge' });
    }
    if (!settled.ok && settled.reason === 'malformed') {
      await finishWebhookEvent(eventId, { verified_by_fetch: true });
      return res.status(400).json({ error: 'Malformed webhook' });
    }
    if (!settled.ok) {
      console.error('tapWebhook: refused to confirm', {
        vertical: settled.vertical,
        code: settled.code,
        chargeId,
        detail: settled.detail,
      });
      await finishWebhookEvent(eventId, { verified_by_fetch: false });
      // Still 200: retrying an event we have correctly decided to reject
      // achieves nothing but six more deliveries over three hours.
      return res.json({ received: true, ignored: settled.detail && settled.detail.reason });
    }

    if (settled.outcome === 'failed' || settled.outcome === 'ignored') {
      await finishWebhookEvent(eventId, { verified_by_fetch: true, event_type: settled.status });
      return res.json({ received: true, ignored: settled.status });
    }

    const { vertical, record } = settled;
    await finishWebhookEvent(eventId, {
      verified_by_fetch: true,
      ...(vertical === 'ride' ? { booking_id: record.id } : {}),
      ...(vertical === 'food' ? { order_id: record.id } : {}),
      ...(vertical === 'shop' ? { shop_order_id: record.id } : {}),
    });
    return res.json({ received: true });
  } catch (err) {
    console.error('tapWebhook error:', err);
    await finishWebhookEvent(eventId, { verified_by_fetch: false });
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Rides: start a card charge --------------------------------------
//
// This endpoint is new. The frontend has been calling
// POST /api/payments/:code/tap-charge since the Tap work began, but no such
// route was ever mounted in app.js — it 404s, hidden only by the
// VITE_TAP_ENABLED flag on the button.
async function createBookingCardCharge(req, res) {
  try {
    const booking = await gatewayPaymentRepository.cardBookingByCode(req.params.code);

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // No admin bypass on a card charge, unlike the proof endpoints: an
    // admin acting on a passenger's booking must not be able to attach or
    // charge that passenger's card.
    // The !booking.customer_id half is load-bearing: a guest booking has no
    // owner, and null !== undefined comparisons are not something to leave to
    // chance on a money path.
    if (!booking.customer_id || booking.customer_id !== req.userId) {
      return res.status(403).json({ error: 'This booking belongs to another account' });
    }
    if (booking.payment_method === 'cash') {
      return res.status(409).json({ error: 'This booking is cash on delivery — no online payment is needed' });
    }
    if (!PAYABLE_BOOKING_STATUSES.includes(booking.payment_status)) {
      return res.status(409).json({ error: `Payment is already ${booking.payment_status}` });
    }

    const { payableAmount } = require('../lib/fare');
    const result = await chargeForOrder({
      req,
      profile: req.profile,
      vertical: 'ride',
      code: booking.booking_code,
      amount: payableAmount(booking),
      redirectPath: `/track/${booking.booking_code}`,
      savedMethodId: req.body.saved_method_id || null,
      saveCard: req.body.save_card === true,
    });

    return respondToCharge(res, result, booking.booking_code, async () => {
      await confirmGatewayPayment({
        vertical: 'ride',
        code: booking.booking_code,
        chargeId: result.chargeId,
        status: 'CAPTURED',
        amountPaid: result.charge && result.charge.amount,
        currency: result.charge && result.charge.currency,
      });
    }, 'ride');
  } catch (err) {
    console.error('createBookingCardCharge error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Verify on return -------------------------------------------------
//
// The customer has just come back from Tap's hosted page. Tap appends
// tap_id to the redirect URL and we used to throw it away, leaving the
// tracking page to poll a row only the webhook could change — so a lost
// webhook meant polling forever on an order that was actually paid.
//
// This is the cheap half of the backstop: it catches every case where the
// customer returns, which is most of them. The sweeper catches the rest.
//
// Authenticated, and ownership is checked against the ORDER the charge
// names — not against anything the client sent. A stranger who guesses a
// tap_id gets 403; they cannot settle, refund, or even read someone else's
// order through it. The charge id itself is looked up rather than trusted:
// a client that edits it simply finds nothing.
async function verifyCharge(req, res) {
  try {
    const chargeId = String(req.params.chargeId || '');
    if (!chargeId || chargeId.length > 80) {
      return res.status(400).json({ error: 'Invalid charge reference' });
    }

    const owned = await findByChargeId(chargeId);
    if (!owned) return res.status(404).json({ error: 'No payment found for that reference' });

    // settleCharge is idempotent — if the webhook already landed this is a
    // no-op that reports 'already_paid', which is exactly what the client
    // needs to stop polling.
    const settled = await settleCharge(chargeId);

    if (!settled.ok) {
      const status = settled.reason === 'fetch_failed' ? 502 : 409;
      console.error('verifyCharge could not settle', {
        chargeId,
        reason: settled.reason,
        detail: settled.detail,
      });
      return res.status(status).json({ error: 'Could not confirm that payment yet' });
    }

    // The record is loaded by settleCharge; check the caller owns it before
    // saying anything about it. Rides alias user_id -> customer_id.
    const ownerId = settled.record && settled.record.customer_id;
    if (ownerId && ownerId !== req.userId && req.role !== 'admin') {
      return res.status(403).json({ error: 'That payment belongs to another account' });
    }

    // A failed or still-in-flight charge loads no record, so there is
    // nothing to check ownership against — answer the outcome and nothing
    // identifying. The client only needs to know whether to stop polling.
    if (!ownerId) return res.json({ outcome: settled.outcome, paid: false });

    return res.json({
      code: settled.code,
      vertical: settled.vertical,
      outcome: settled.outcome, // paid | already_paid | failed | ignored
      paid: settled.outcome === 'paid' || settled.outcome === 'already_paid',
    });
  } catch (err) {
    console.error('verifyCharge error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { tapWebhook, createBookingCardCharge, verifyCharge };
