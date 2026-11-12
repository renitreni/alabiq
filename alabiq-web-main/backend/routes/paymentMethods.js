// ---------------------------------------------------------------------
// /api/payment-methods — the customer's saved cards.
//
// ROUTER-LEVEL GUARD: every endpoint here exposes or mutates payment
// references, so requireAuth is applied once rather than per-route (the
// failure mode of per-route guards is forgetting one on a new endpoint —
// handbook Part 13 §13.4.2).
//
// There is no POST / here on purpose. Tap only mints a saved card as a
// side effect of a real charge with save_card:true, so a card is added by
// paying for something, never by posting an id to this router.
// ---------------------------------------------------------------------
const express = require('express');

const { requireAuth } = require('../middleware/auth');
const {
  paymentMethodsLimiter,
  paymentMethodsWriteLimiter,
} = require('../middleware/rateLimiters');
const {
  listPaymentMethods,
  deletePaymentMethod,
  makeDefault,
} = require('../controllers/paymentMethodsController');

const router = express.Router();

router.use(requireAuth);

router.get('/', paymentMethodsLimiter, listPaymentMethods);
router.delete('/:id', paymentMethodsWriteLimiter, deletePaymentMethod);
// POST rather than PATCH: the operation is "move the default flag", not
// "edit a field". A PATCH would invite is_default:false semantics, which
// the partial unique index behind it cannot express.
router.post('/:id/default', paymentMethodsWriteLimiter, makeDefault);

module.exports = router;
