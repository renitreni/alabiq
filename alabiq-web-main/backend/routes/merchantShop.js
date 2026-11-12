const express = require('express');
const router = express.Router();
const { requireMerchantVertical } = require('../middleware/auth');
const { validateBody } = require('../lib/validate');
const { merchantOrderLimiter } = require('../middleware/rateLimiters');
const ctrl = require('../controllers/merchantShopController');
const orders = require('../controllers/merchantShopOrdersController');
const hours = require('../controllers/merchantHoursController');

// ROUTER-LEVEL GUARD, not per-route. Every endpoint in this file is
// protected, including ones added tomorrow — the failure mode of per-route
// guards is forgetting one on a new endpoint (handbook Part 13 §13.4.2).
//
// The vertical check is part of the guard: merchants.owner_id is UNIQUE, so
// this account maps to exactly one merchant, and a restaurant owner reaching
// here gets a clean 403 rather than an empty store.
router.use(requireMerchantVertical('shop'));

// --- Business profile ---
router.get('/profile', ctrl.getProfile);
router.patch(
  '/profile',
  validateBody({
    name: { type: 'string', maxLength: 160 },
    cuisine_type: { type: 'string', maxLength: 80, nullable: true },
    description: { type: 'string', maxLength: 2000, nullable: true },
    logo_url: { type: 'string', maxLength: 500, nullable: true },
    address: { type: 'string', maxLength: 500, nullable: true },
    street: { type: 'string', maxLength: 200, nullable: true },
    building_number: { type: 'string', maxLength: 100, nullable: true },
    lat: { type: 'number', min: -90, max: 90, nullable: true },
    lng: { type: 'number', min: -180, max: 180, nullable: true },
    // is_active, is_featured, badge, status, credit_*, vertical and owner_id
    // are ADMIN decisions and are deliberately absent. validateBody rejects
    // unknown fields, so a store cannot list itself or clear its own credit.
  }),
  ctrl.updateProfile
);

// --- Images (public merchant-images bucket) ---
router.post(
  '/images/signed-url',
  validateBody({
    kind: { type: 'string', enum: ['logo', 'item'] },
    file_name: { type: 'string', maxLength: 255 },
    mime_type: { type: 'string', required: true, maxLength: 100 },
    size_bytes: { type: 'integer', min: 0 },
  }),
  ctrl.createImageUploadUrl
);

// --- Catalogue ---
// --- Opening hours + "closed now" (0038) ---
// The store id comes from the session, never the request. Deliberately NOT
// folded into the profile PATCH whitelist above, which exists to stop a
// store listing itself or clearing its own credit.
router.get('/hours', hours.ownerGetHours);
router.put(
  '/hours',
  validateBody({ hours: { type: 'array', itemType: 'object', maxItems: 50, required: true } }),
  hours.ownerSetHours
);
router.patch(
  '/accepting-orders',
  validateBody({ accepting_orders: { type: 'boolean', required: true } }),
  hours.ownerSetAccepting
);

router.get('/catalogue', ctrl.getCatalogue);
router.get('/analytics', ctrl.getAnalytics);

router.post(
  '/categories',
  validateBody({
    name: { type: 'string', required: true, maxLength: 120 },
    sort_order: { type: 'integer', min: 0, max: 9999 },
    is_active: { type: 'boolean' },
  }),
  ctrl.addCategory
);
router.patch(
  '/categories/:id',
  validateBody({
    name: { type: 'string', maxLength: 120 },
    sort_order: { type: 'integer', min: 0, max: 9999 },
    is_active: { type: 'boolean' },
  }),
  ctrl.updateCategory
);
router.delete('/categories/:id', ctrl.deleteCategory);

// net_price is NOT in either product schema. It is the store's own cut and
// is admin-only: an owner who could set it would set it equal to price and
// zero our markup. validateBody rejects unknown fields, so this omission is
// the enforcement, not just documentation.
const PRODUCT_FIELDS = {
  category_id: { type: 'string', maxLength: 60, nullable: true },
  name: { type: 'string', maxLength: 200 },
  description: { type: 'string', maxLength: 2000, nullable: true },
  brand: { type: 'string', maxLength: 120, nullable: true },
  unit: { type: 'string', maxLength: 60, nullable: true },
  weight_grams: { type: 'integer', min: 0, max: 1000000, nullable: true },
  barcode: { type: 'string', maxLength: 64, nullable: true },
  price: { type: 'number', min: 0.01, max: 1000000 },
  image_url: { type: 'string', maxLength: 500, nullable: true },
  stock_quantity: { type: 'integer', min: 0, max: 1000000 },
  low_stock_threshold: { type: 'integer', min: 0, max: 100000 },
  track_stock: { type: 'boolean' },
  is_available: { type: 'boolean' },
};

router.post(
  '/products',
  validateBody({ ...PRODUCT_FIELDS, name: { ...PRODUCT_FIELDS.name, required: true }, price: { ...PRODUCT_FIELDS.price, required: true } }),
  ctrl.addProduct
);
router.patch('/products/:id', validateBody(PRODUCT_FIELDS), ctrl.updateProduct);
router.delete('/products/:id', ctrl.deleteProduct);

// --- Variants (size / colour / SKU, each with its own price and stock) ---
const VARIANT_FIELDS = {
  sku: { type: 'string', maxLength: 64, nullable: true },
  label: { type: 'string', maxLength: 120 },
  price: { type: 'number', min: 0.01, max: 1000000, nullable: true },
  stock_quantity: { type: 'integer', min: 0, max: 1000000 },
  sort_order: { type: 'integer', min: 0, max: 9999 },
  is_available: { type: 'boolean' },
};

router.post(
  '/products/:id/variants',
  validateBody({ ...VARIANT_FIELDS, label: { ...VARIANT_FIELDS.label, required: true } }),
  ctrl.addVariant
);
router.patch('/products/:id/variants/:variantId', validateBody(VARIANT_FIELDS), ctrl.updateVariant);
router.delete('/products/:id/variants/:variantId', ctrl.deleteVariant);

// --- Stock ---
router.get('/inventory', ctrl.getInventory);
router.patch(
  '/products/:id/stock',
  validateBody({
    variant_id: { type: 'string', maxLength: 60, nullable: true },
    stock_quantity: { type: 'integer', required: true, min: 0, max: 1000000 },
  }),
  ctrl.setStock
);

// --- Orders ---
// merchantOrderLimiter is finally mounted here. It has existed in
// rateLimiters.js since the food vertical but had no router to attach to;
// accept/reject/status are exactly the retry-amplification surface it was
// written for.
router.get('/orders', orders.listOrders);
router.post('/orders/:code/accept', merchantOrderLimiter, orders.acceptOrder);
router.post(
  '/orders/:code/reject',
  merchantOrderLimiter,
  validateBody({ reason: { type: 'string', maxLength: 500, nullable: true } }),
  orders.rejectOrder
);
router.patch(
  '/orders/:code/status',
  merchantOrderLimiter,
  // A store's authority STOPS at 'ready'. out_for_delivery and delivered are
  // rider-only, backed by photo proof and a geofence.
  validateBody({ status: { type: 'string', required: true, enum: ['packing', 'ready'] } }),
  orders.advanceStatus
);
// Withdraw an order the store already accepted. `reason` is REQUIRED here
// where the admin route leaves it optional: the customer is shown this
// sentence verbatim, and "cancelled, no reason given" is the message this
// endpoint exists to avoid.
router.post(
  '/orders/:code/cancel',
  merchantOrderLimiter,
  validateBody({ reason: { type: 'string', required: true, maxLength: 300 } }),
  orders.cancelOrder
);

module.exports = router;
