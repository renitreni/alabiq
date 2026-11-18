// ---------------------------------------------------------------------
// /api/payments — the gateway webhook and the rides card charge.
//
// Food and shop keep their charge endpoints on their own routers (they need
// the vertical's own order loading); only the webhook is shared, because it
// must verify one signature the same way for all three.
// ---------------------------------------------------------------------
const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { idempotent } = require('../middleware/idempotency');
const { validateBody } = require('../lib/validate');
const { cardChargeLimiter, webhookLimiter, paymentMethodsLimiter } = require('../middleware/rateLimiters');
const { tapWebhook, createBookingCardCharge, verifyCharge } = require('../controllers/cardPaymentsController');

const router = express.Router();

// STATIC SEGMENT FIRST, and the charge route is /bookings/:code/... rather
// than the /:code/tap-charge shape the frontend used to call, precisely so
// "webhooks" can never be parsed as a booking code.
//
// Unauthenticated by necessity — Tap has no credential to present. The
// controls are the hashstring HMAC and a re-fetch of the charge from Tap
// before anything is marked paid.
router.post('/webhooks/tap', webhookLimiter, tapWebhook);

// Whether the checkout screens may advertise card at all. Public and
// deliberately thin: this whole router is replaced by a 503 stub when Tap is
// unconfigured, so an unreachable endpoint already means "no card" and the
// client needs no flag of its own. Unlike /api/health this says nothing about
// test mode, keys, or which gateway is behind it.
router.get('/config', (req, res) => res.json({ cardAvailable: true }));

router.post(
  '/bookings/:code/charge',
  requireAuth,
  cardChargeLimiter,
  idempotent,
  validateBody({
    saved_method_id: { type: 'string', maxLength: 60, nullable: true },
    save_card: { type: 'boolean' },
  }),
  createBookingCardCharge
);

// The customer landing back from the hosted page, with Tap's tap_id in the
// URL. STATIC SEGMENT FIRST, same reason as the webhook: 'charges' must
// never be parsable as a booking code.
//
// POST, not GET: it can settle an order, so it is not safe to prefetch or
// retry blindly. Rate-limited on the read bucket rather than the charge one
// — it starts no payment, and a customer refreshing a stuck tracking page
// must not be locked out of the very call that unsticks it.
router.post('/charges/:chargeId/verify', requireAuth, paymentMethodsLimiter, verifyCharge);

module.exports = router;
