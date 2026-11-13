const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { validateBody } = require('../lib/validate');
const {
  getStats,
  getReports,
  listBookings,
  getBookingDetail,
  verifyPayment,
  rejectPayment,
  assignDriver,
  listDrivers,
  setDriverApproval,
  listDriverCash,
  settleDriverCash,
  listDriverDocuments,
  reviewDriverDocument,
} = require('../controllers/adminController');
const food = require('../controllers/food/adminFoodController');
const hours = require('../controllers/merchantHoursController');
const errors = require('../controllers/adminErrorsController');
const supers = require('../controllers/adminAdminsController');
const adminPartner = require('./adminPartner');

// Opening-hours payloads. The windows themselves are validated in
// lib/merchantHours.js — this only keeps the shape sane before it gets there.
const HOURS_BODY = {
  hours: { type: 'array', itemType: 'object', maxItems: 50, required: true },
};
const ACCEPTING_BODY = { accepting_orders: { type: 'boolean', required: true } };

// Every admin route requires an authenticated admin (Supabase JWT, role admin).
router.use(requireAdmin);

router.use('/partner', adminPartner);

router.get('/stats', getStats);
router.get('/reports', getReports);
router.get('/bookings', listBookings);
router.get('/bookings/:bookingCode', getBookingDetail);
router.post('/bookings/:bookingCode/verify-payment', verifyPayment);
router.post('/bookings/:bookingCode/reject-payment', rejectPayment);
router.post('/bookings/:bookingCode/assign-driver', assignDriver);

// Driver approval (verification)
router.get('/drivers', listDrivers);
router.post('/drivers/:driverId/approval', setDriverApproval);

// Driver cash settlement (pick & drop cash rides)
router.get('/drivers/cash', listDriverCash);
router.post(
  '/drivers/:driverId/settle-cash',
  validateBody({
    amount: { type: 'number', required: true, min: 0.01, max: 1000000 },
    note: { type: 'string', maxLength: 500, nullable: true },
  }),
  settleDriverCash
);
router.get('/drivers/:driverId/documents', listDriverDocuments);
router.post('/drivers/:driverId/documents/:docId/review', reviewDriverDocument);

// --- Backend error log (migration 0042) -------------------------------
// error_logs is revoked from anon/authenticated, so this router is the
// only path to it. /summary before /:id, or 'summary' matches as an id.
router.get('/errors', errors.listErrors);
router.get('/errors/summary', errors.errorSummary);
router.get('/errors/:id', errors.getError);
router.post(
  '/errors/:id/resolve',
  validateBody({ resolved: { type: 'boolean' } }),
  errors.resolveError
);

// --- Admin account management (was super admin only, migration 0043) ----
// Any admin may manage admin accounts and platform settings; the router-wide
// requireAdmin above is the only gate. Self-deactivation, demoting the last
// super admin, and ADMIN_EMAILS accounts are still refused in the controller.
//
// Note the ordering rule from the errors section applies here too:
// /login-events/summary is declared before any /login-events/:id would be.
const ADMIN_BODY = {
  full_name: { type: 'string', required: true, maxLength: 120 },
  mobile_number: { type: 'string', maxLength: 30, nullable: true },
  whatsapp_number: { type: 'string', maxLength: 30, nullable: true },
  is_super_admin: { type: 'boolean' },
};

router.get('/admins', supers.listAdmins);
router.post(
  '/admins',
  validateBody({ email: { type: 'string', required: true, maxLength: 254 }, password: { type: 'string', required: true, maxLength: 128 }, ...ADMIN_BODY }),
  supers.createAdmin
);
// full_name is required on create but optional on edit, so the schema is
// the same shape with the requirement dropped rather than a second copy.
router.patch(
  '/admins/:id',
  validateBody({ ...ADMIN_BODY, full_name: { type: 'string', maxLength: 120 } }),
  supers.updateAdmin
);
router.post(
  '/admins/:id/password',
  validateBody({ password: { type: 'string', required: true, maxLength: 128 } }),
  supers.resetAdminPassword
);
router.post('/admins/:id/deactivate', supers.deactivateAdmin);
router.post('/admins/:id/reactivate', supers.reactivateAdmin);

// Readable by any admin (knowing the distance limit is not privileged),
// writable by any admin.
router.get('/settings', supers.getSettings);
router.patch(
  '/settings',
  validateBody({
    max_distance_km: { type: 'number', min: 0.1, max: 100000, nullable: true },
    stcpay_enabled: { type: 'boolean' },
  }),
  supers.updateSettings
);

router.get('/login-events/summary', supers.loginEventSummary);
router.get('/login-events', supers.listLoginEvents);

// --- User Accounts (all roles) -----------------------------------------
// Any admin may view and manage all user accounts (passenger, driver, merchant, admin).
const USER_ROLE_BODY = {
  role: { type: 'string', required: true, enum: ['passenger', 'driver', 'merchant', 'admin'] },
};

router.get('/users', supers.listAllUsers);
router.patch('/users/:id/role', validateBody(USER_ROLE_BODY), supers.updateUserRole);
router.post('/users/:id/deactivate', supers.deactivateUser);
router.post('/users/:id/reactivate', supers.reactivateUser);
router.post('/users/:id/password', supers.resetUserPassword);

// --- Food Delivery oversight (PRD: merchant credit + reconciliation) ---
// Restaurants are onboarded by ADMINS: they contact Alabiq, an admin
// creates the restaurant, imports the menu/prices/photos, links the owner's
// account, and finally lists it (is_active = true).
const ADMIN_MERCHANT_FIELDS = {
  name: { type: 'string', maxLength: 120 },
  cuisine_type: { type: 'string', maxLength: 60, nullable: true },
  description: { type: 'string', maxLength: 1000, nullable: true },
  logo_url: { type: 'string', maxLength: 500, nullable: true },
  address: { type: 'string', maxLength: 500, nullable: true },
  street: { type: 'string', maxLength: 200, nullable: true },
  building_number: { type: 'string', maxLength: 100, nullable: true },
  // Location is mandatory: absent keys are fine on a partial PATCH, but an
  // explicit null (clearing the pin) is rejected. Create requires both; a
  // merchant cannot be listed without a pin (see adminFoodController).
  lat: { type: 'number', min: -90, max: 90 },
  lng: { type: 'number', min: -180, max: 180 },
  is_active: { type: 'boolean' }, // listing on/off (vetting gate)
  is_featured: { type: 'boolean' }, // leads the public homepage grid
  badge: { type: 'string', enum: ['top_rated', 'popular', 'new', 'trending'], nullable: true },
};
const ADMIN_ITEM_FIELDS = {
  category_id: { type: 'string', maxLength: 60, nullable: true },
  name: { type: 'string', maxLength: 120 },
  description: { type: 'string', maxLength: 1000, nullable: true },
  price: { type: 'number', min: 0.01, max: 100000 }, // LIST price (shown to the customer)
  net_price: { type: 'number', min: 0.01, max: 100000, nullable: true }, // what the restaurant keeps; markup = price - net_price
  item_type: { type: 'string', enum: ['meal_package', 'drink_dessert_addon'] },
  image_url: { type: 'string', maxLength: 500, nullable: true },
  is_available: { type: 'boolean' },
  // Drink sizes (Milk Tea): [{ id, label, price, enabled }] — per-entry
  // validation happens in lib/foodSizes.normalizeSizeOptions.
  size_options: { type: 'array', itemType: 'object', maxItems: 6, nullable: true },
};
const ADMIN_CATEGORY_FIELDS = {
  name: { type: 'string', maxLength: 80 },
  sort_order: { type: 'integer', min: 0, max: 1000 },
  is_active: { type: 'boolean' },
};

router.get('/food/overview', food.getOverview);
// The refund queue. Nothing here moves money — it is the list of orders
// that were cancelled or rejected while still marked paid, so a refund
// owed cannot be lost track of between the cancel and the transfer.
router.get('/food/refunds', food.listRefunds);
router.get('/food/merchants', food.listMerchants);
router.post(
  '/food/merchants',
  validateBody({ ...ADMIN_MERCHANT_FIELDS, name: { ...ADMIN_MERCHANT_FIELDS.name, required: true } }),
  food.createMerchant
);
router.patch('/food/merchants/:id', validateBody(ADMIN_MERCHANT_FIELDS), food.updateMerchant);
router.delete('/food/merchants/:id', food.deleteMerchant);
router.post(
  '/food/merchants/:id/suspend',
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  food.suspendMerchant
);
router.post('/food/merchants/:id/reactivate', food.reactivateMerchant);
router.post(
  '/food/merchants/:id/credit',
  validateBody({
    amount: { type: 'number', required: true, min: 0.01, max: 100000 },
    note: { type: 'string', maxLength: 300, nullable: true },
  }),
  food.replenishCredit
);
// Image upload (logo / menu photo): issue a signed upload URL for the PUBLIC
// merchant-images bucket. The frontend uploads then saves the returned public
// URL via the normal merchant/item update endpoints.
router.post(
  '/food/merchants/:id/image/signed-url',
  validateBody({
    kind: { type: 'string', required: true, enum: ['logo', 'item'] },
    file_name: { type: 'string', required: true, maxLength: 300 },
    mime_type: { type: 'string', maxLength: 100, nullable: true },
  }),
  food.createMerchantImageUploadUrl
);
// Owner account provisioning (contract-signing step): create/reuse + link the
// owner's account, set the password the admin chose, and grant it the merchant
// role. The password is permanent and admin-issued — the platform sends no
// mail, so there is no self-service reset for merchants.
router.post(
  '/food/merchants/:id/owner',
  validateBody({
    email: { type: 'string', required: true, maxLength: 200 },
    password: { type: 'string', required: true, maxLength: 128 },
    full_name: { type: 'string', maxLength: 120, nullable: true },
    phone: { type: 'string', maxLength: 40, nullable: true },
  }),
  food.setMerchantOwner
);
// Recovery: re-issue the owner's password (admin-driven, no reset email).
router.post(
  '/food/merchants/:id/owner/password',
  validateBody({
    password: { type: 'string', required: true, maxLength: 128 },
  }),
  food.setMerchantOwnerPassword
);
// Menu import + moderation (any restaurant)
router.get('/food/merchants/:id/menu', food.getMerchantMenu);
router.post(
  '/food/merchants/:id/menu/categories',
  validateBody({ ...ADMIN_CATEGORY_FIELDS, name: { ...ADMIN_CATEGORY_FIELDS.name, required: true } }),
  food.addCategoryForMerchant
);
router.patch('/food/categories/:id', validateBody(ADMIN_CATEGORY_FIELDS), food.updateAnyCategory);
router.delete('/food/categories/:id', food.deleteAnyCategory);
router.post(
  '/food/merchants/:id/menu/items',
  validateBody({
    ...ADMIN_ITEM_FIELDS,
    name: { ...ADMIN_ITEM_FIELDS.name, required: true },
    price: { ...ADMIN_ITEM_FIELDS.price, required: true },
    item_type: { ...ADMIN_ITEM_FIELDS.item_type, required: true },
  }),
  food.addItemForMerchant
);
router.patch('/food/items/:id', validateBody(ADMIN_ITEM_FIELDS), food.moderateItem);
router.delete('/food/items/:id', food.removeItem);
// Settlement report: per-restaurant payout vs. our markup over a date range,
// split by who collected the money (online = platform, cash = rider). Feeds
// the "Download CSV" button in the Food Admin portal.
router.get('/food/settlement', food.getSettlement);
// Orders: admins run the restaurants (no owner accounts), so accept/reject
// and the fulfillment ladder live here. Accept enforces the 300 SAR credit.
router.get('/food/orders', food.listOrders);
router.post('/food/orders/:code/accept', food.acceptOrder);
router.post(
  '/food/orders/:code/reject',
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  food.rejectOrder
);
router.patch(
  '/food/orders/:code/status',
  validateBody({
    status: {
      type: 'string',
      required: true,
      enum: ['preparing', 'ready', 'out_for_delivery', 'delivered'],
    },
  }),
  food.advanceOrderStatus
);
// STC Pay reconciliation
router.post('/food/orders/:code/verify-payment', food.verifyPayment);
router.post(
  '/food/orders/:code/assign-driver',
  validateBody({ driver_id: { type: 'string', required: true, maxLength: 60 } }),
  food.assignDriver
);
router.post(
  '/food/orders/:code/reject-payment',
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  food.rejectPayment
);
// Support: cancel an order; if it was paid, mark the refund done once the
// money is returned (policy: within a few hours up to one day).
router.post(
  '/food/orders/:code/cancel',
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  food.cancelOrder
);
router.post('/food/orders/:code/refund', food.refundPayment);
// Rider proof photos (mandatory pickup + delivery shots) — signed URLs.
router.get('/food/orders/:code/photos', food.getOrderPhotos);

// =====================================================================
// Ecommerce (shop). Mirrors the /food block above.
//
// The whole router is already behind requireAdmin, so nothing below
// re-checks the role. This is the ONLY place net_price is writable — the
// store portal's schemas reject it and migration 0030 revoked the direct
// PostgREST write path, so admin is the single writer by design.
// =====================================================================
const shop = require('../controllers/shop/adminShopController');

router.get('/shop/overview', shop.getOverview);
router.get('/shop/refunds', shop.listRefunds);

// --- Stores ---
router.get('/shop/stores', shop.listStores);
router.post(
  '/shop/stores',
  validateBody({
    name: { type: 'string', required: true, maxLength: 160 },
    cuisine_type: { type: 'string', maxLength: 80, nullable: true },
    description: { type: 'string', maxLength: 2000, nullable: true },
    logo_url: { type: 'string', maxLength: 500, nullable: true },
    address: { type: 'string', maxLength: 500, nullable: true },
    street: { type: 'string', maxLength: 200, nullable: true },
    building_number: { type: 'string', maxLength: 100, nullable: true },
    lat: { type: 'number', min: -90, max: 90, nullable: true },
    lng: { type: 'number', min: -180, max: 180, nullable: true },
    is_active: { type: 'boolean' },
    is_featured: { type: 'boolean' },
    // The same four values ADMIN_MERCHANT_FIELDS uses. It was a free
    // 40-char string here while the DB has merchants_badge_chk (0015),
    // so anything else was a 500 instead of a 400.
    badge: { type: 'string', enum: ['top_rated', 'popular', 'new', 'trending'], nullable: true },
    credit_limit: { type: 'number', min: 0, max: 1000000 },
    // `vertical` is deliberately absent: the controller pins it to 'shop'
    // so this endpoint can never mint a restaurant.
  }),
  shop.createStore
);
router.patch(
  '/shop/stores/:id',
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
    is_active: { type: 'boolean' },
    is_featured: { type: 'boolean' },
    // The same four values ADMIN_MERCHANT_FIELDS uses. It was a free
    // 40-char string here while the DB has merchants_badge_chk (0015),
    // so anything else was a 500 instead of a 400.
    badge: { type: 'string', enum: ['top_rated', 'popular', 'new', 'trending'], nullable: true },
    credit_limit: { type: 'number', min: 0, max: 1000000 },
  }),
  shop.updateStore
);
router.delete('/shop/stores/:id', shop.deleteStore);
router.post(
  '/shop/stores/:id/suspend',
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  shop.suspendStore
);
router.post('/shop/stores/:id/reactivate', shop.reactivateStore);
router.post(
  '/shop/stores/:id/credit',
  validateBody({
    amount: { type: 'number', required: true, min: 0, max: 1000000 },
    note: { type: 'string', maxLength: 300, nullable: true },
  }),
  shop.replenishCredit
);
// --- Opening hours + "closed now" (shared by both verticals, 0038) ---
// Same handlers for /food/merchants/:id and /shop/stores/:id: merchant_hours
// is one table and the id identifies the vertical on its own.
router.get('/food/merchants/:id/hours', hours.adminGetHours);
router.put('/food/merchants/:id/hours', validateBody(HOURS_BODY), hours.adminSetHours);
router.patch('/food/merchants/:id/accepting-orders', validateBody(ACCEPTING_BODY), hours.adminSetAccepting);
router.get('/shop/stores/:id/hours', hours.adminGetHours);
router.put('/shop/stores/:id/hours', validateBody(HOURS_BODY), hours.adminSetHours);
router.patch('/shop/stores/:id/accepting-orders', validateBody(ACCEPTING_BODY), hours.adminSetAccepting);

router.post(
  '/shop/stores/:id/image/signed-url',
  validateBody({
    kind: { type: 'string', enum: ['logo', 'item'] },
    file_name: { type: 'string', maxLength: 255 },
    mime_type: { type: 'string', maxLength: 100 },
  }),
  shop.createStoreImageUploadUrl
);
router.post(
  '/shop/stores/:id/owner',
  validateBody({
    email: { type: 'string', required: true, maxLength: 200 },
    password: { type: 'string', required: true, maxLength: 128 },
    full_name: { type: 'string', maxLength: 160, nullable: true },
    phone: { type: 'string', maxLength: 40, nullable: true },
  }),
  shop.setStoreOwner
);
router.post(
  '/shop/stores/:id/owner/password',
  validateBody({
    password: { type: 'string', required: true, maxLength: 128 },
  }),
  shop.setStoreOwnerPassword
);

// --- Catalogue (net_price lives here) ---
router.get('/shop/stores/:id/catalogue', shop.getStoreCatalogue);
router.post(
  '/shop/stores/:id/categories',
  validateBody({
    name: { type: 'string', required: true, maxLength: 120 },
    sort_order: { type: 'integer', min: 0, max: 9999 },
    is_active: { type: 'boolean' },
  }),
  shop.addCategory
);
router.patch(
  '/shop/categories/:id',
  validateBody({
    name: { type: 'string', maxLength: 120 },
    sort_order: { type: 'integer', min: 0, max: 9999 },
    is_active: { type: 'boolean' },
  }),
  shop.updateCategory
);
router.delete('/shop/categories/:id', shop.deleteCategory);

const ADMIN_PRODUCT_FIELDS = {
  category_id: { type: 'string', maxLength: 60, nullable: true },
  name: { type: 'string', maxLength: 200 },
  description: { type: 'string', maxLength: 2000, nullable: true },
  brand: { type: 'string', maxLength: 120, nullable: true },
  unit: { type: 'string', maxLength: 60, nullable: true },
  weight_grams: { type: 'integer', min: 0, max: 1000000, nullable: true },
  barcode: { type: 'string', maxLength: 64, nullable: true },
  price: { type: 'number', min: 0.01, max: 1000000 },
  // THE markup control. Admin-only, everywhere.
  net_price: { type: 'number', min: 0.01, max: 1000000, nullable: true },
  image_url: { type: 'string', maxLength: 500, nullable: true },
  stock_quantity: { type: 'integer', min: 0, max: 1000000 },
  low_stock_threshold: { type: 'integer', min: 0, max: 100000 },
  track_stock: { type: 'boolean' },
  is_available: { type: 'boolean' },
};
router.post(
  '/shop/stores/:id/products',
  validateBody({
    ...ADMIN_PRODUCT_FIELDS,
    name: { ...ADMIN_PRODUCT_FIELDS.name, required: true },
    price: { ...ADMIN_PRODUCT_FIELDS.price, required: true },
  }),
  shop.addProduct
);
router.patch('/shop/products/:id', validateBody(ADMIN_PRODUCT_FIELDS), shop.updateProduct);
router.delete('/shop/products/:id', shop.deleteProduct);

const ADMIN_VARIANT_FIELDS = {
  sku: { type: 'string', maxLength: 64, nullable: true },
  label: { type: 'string', maxLength: 120 },
  price: { type: 'number', min: 0.01, max: 1000000, nullable: true },
  net_price: { type: 'number', min: 0.01, max: 1000000, nullable: true },
  stock_quantity: { type: 'integer', min: 0, max: 1000000 },
  sort_order: { type: 'integer', min: 0, max: 9999 },
  is_available: { type: 'boolean' },
};
router.post(
  '/shop/products/:id/variants',
  validateBody({ ...ADMIN_VARIANT_FIELDS, label: { ...ADMIN_VARIANT_FIELDS.label, required: true } }),
  shop.upsertVariant
);
router.patch('/shop/products/:id/variants/:variantId', validateBody(ADMIN_VARIANT_FIELDS), shop.upsertVariant);
router.delete('/shop/products/:id/variants/:variantId', shop.deleteVariant);
router.get('/shop/inventory', shop.getInventory);

// --- Orders (admin gets the FULL status ladder as a support fallback) ---
router.get('/shop/orders', shop.listOrders);
router.post('/shop/orders/:code/accept', shop.acceptOrder);
router.post(
  '/shop/orders/:code/reject',
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  shop.rejectOrder
);
router.patch(
  '/shop/orders/:code/status',
  validateBody({
    status: {
      type: 'string',
      required: true,
      enum: ['packing', 'ready', 'out_for_delivery', 'delivered'],
    },
  }),
  shop.advanceOrderStatus
);
router.post(
  '/shop/orders/:code/verify-payment',
  validateBody({ reference: { type: 'string', maxLength: 120, nullable: true } }),
  shop.verifyPayment
);
router.post(
  '/shop/orders/:code/reject-payment',
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  shop.rejectPayment
);
router.post('/shop/orders/:code/refund', shop.refundPayment);
router.post(
  '/shop/orders/:code/cancel',
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  shop.cancelOrder
);
router.post(
  '/shop/orders/:code/assign-driver',
  validateBody({ driver_id: { type: 'string', required: true, maxLength: 60 } }),
  shop.assignDriver
);
router.get('/shop/orders/:code/photos', shop.getOrderPhotos);
router.get('/shop/settlement', shop.getSettlement);

module.exports = router;
