const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { optionalAuth } = require('../middleware/foodAuth');
const { idempotent } = require('../middleware/idempotency');
const { validateBody } = require('../lib/validate');
const {
  shopSearchLimiter,
  shopCheckoutLimiter,
  shopPayLimiter,
  shopEventsLimiter,
  cardChargeLimiter,
} = require('../middleware/rateLimiters');
const { listStores, getStore } = require('../controllers/shop/storesController');
const {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
} = require('../controllers/shop/cartController');
const {
  checkout,
  listOrders,
  getOrder,
  updateOrderContact,
  getPaymentInfo,
  createPayUploadUrl,
  recordPayment,
  createCardCharge,
} = require('../controllers/shop/ordersController');
const { recordEvent } = require('../controllers/shop/eventsController');
const { rateShopDriver } = require('../controllers/ratingsController');

// --- Discovery (public; optionalAuth only tags analytics) ---
router.get('/stores', shopSearchLimiter, optionalAuth, listStores);
router.get('/stores/:id', shopSearchLimiter, optionalAuth, getStore);

// --- Cart (signed-in customers; server reads all prices itself) ---
router.get('/cart', requireAuth, getCart);
router.post(
  '/cart/items',
  requireAuth,
  validateBody({
    product_id: { type: 'string', required: true, maxLength: 60 },
    variant_id: { type: 'string', maxLength: 60, nullable: true },
    quantity: { type: 'integer', min: 1, max: 50 },
  }),
  addCartItem
);
router.patch(
  '/cart/items/:id',
  requireAuth,
  validateBody({ quantity: { type: 'integer', required: true, min: 0, max: 50 } }),
  updateCartItem
);
router.delete('/cart/items/:id', requireAuth, removeCartItem);

// --- Checkout: the server recomputes ALL money from DB prices, enforces the
//     50 SAR minimum + 15 km radius (422), and reserves stock atomically
//     inside one Postgres transaction (409 out_of_stock on a shortfall). ---
router.post(
  '/orders',
  requireAuth,
  shopCheckoutLimiter,
  idempotent,
  validateBody({
    merchant_id: { type: 'string', required: true, maxLength: 60 },
    delivery_address: { type: 'string', required: true, maxLength: 500 },
    delivery_lat: { type: 'number', required: true, min: -90, max: 90 },
    delivery_lng: { type: 'number', required: true, min: -180, max: 180 },
    delivery_street: { type: 'string', required: true, maxLength: 200 },
    delivery_building: { type: 'string', required: true, maxLength: 100 },
    contact_phone: { type: 'string', maxLength: 40, nullable: true },
    // Cash on delivery is available here (unlike food's stcpay-only
    // checkout) because retail baskets are larger and COD is the norm.
    // Card is deliberately NOT selectable here: it is chosen on the payment
    // step via /orders/:code/charge, so an order can never be created with a
    // payment method whose gateway is unconfigured.
    // required: the RPC inserts this into a NOT NULL column, so omitting it
    // surfaced as a generic 500 instead of a 400 naming the missing field.
    payment_method: { type: 'string', required: true, enum: ['stcpay', 'cash', 'tap'] },
  }),
  checkout
);

// --- Tracking + history ---
router.get('/orders', requireAuth, listOrders);
router.get('/orders/:code', requireAuth, getOrder);
router.patch(
  '/orders/:code/contact',
  requireAuth,
  validateBody({ contact_phone: { type: 'string', required: true, maxLength: 40 } }),
  updateOrderContact
);

// --- Payment (STC Pay manual proof; Tap deferred) ---
router.get('/orders/:code/pay', requireAuth, getPaymentInfo);
router.post(
  '/orders/:code/pay/signed-url',
  requireAuth,
  shopPayLimiter,
  validateBody({
    file_name: { type: 'string', maxLength: 255 },
    mime_type: { type: 'string', required: true, maxLength: 100 },
  }),
  createPayUploadUrl
);
router.post(
  '/orders/:code/pay',
  requireAuth,
  shopPayLimiter,
  idempotent,
  validateBody({
    path: { type: 'string', required: true, maxLength: 400 },
    file_name: { type: 'string', maxLength: 255 },
    mime_type: { type: 'string', maxLength: 100 },
    size_bytes: { type: 'integer', min: 0 },
    reference: { type: 'string', maxLength: 120 },
  }),
  recordPayment
);
// Card payment (new card, saved card, or Apple Pay). Tighter limiter than
// the proof endpoints: a saved-card charge can capture with no human step.
router.post(
  '/orders/:code/charge',
  requireAuth,
  cardChargeLimiter,
  idempotent,
  validateBody({
    saved_method_id: { type: 'string', maxLength: 60, nullable: true },
    save_card: { type: 'boolean' },
  }),
  createCardCharge
);

// Rate the delivery rider (1-5 stars) after the order is delivered.
router.post(
  '/orders/:code/rate-driver',
  requireAuth,
  validateBody({
    stars: { type: 'integer', required: true, min: 1, max: 5 },
    comment: { type: 'string', maxLength: 500, nullable: true },
  }),
  rateShopDriver
);

// The Tap webhook used to be mounted here per vertical. There is now one
// handler for all three at POST /api/payments/webhooks/tap — see
// routes/payments.js. Tap is configured with that URL on every charge.

// --- Client analytics events (anonymous allowed, whitelisted names) ---
router.post(
  '/events',
  shopEventsLimiter,
  optionalAuth,
  validateBody({
    event_name: { type: 'string', required: true, maxLength: 60 },
    merchant_id: { type: 'string', maxLength: 60 },
    shop_order_id: { type: 'string', maxLength: 60 },
    params: { type: 'object', maxLength: 2000 },
  }),
  recordEvent
);

module.exports = router;
