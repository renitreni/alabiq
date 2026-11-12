const express = require('express');
const router = express.Router();
const { requireMerchantVertical, requireMerchant } = require('../middleware/auth');
const { validateBody } = require('../lib/validate');
const merchant = require('../controllers/merchantController');
const merchantOrders = require('../controllers/merchantOrdersController');
const hours = require('../controllers/merchantHoursController');
const merchantRepository = require('../repositories/merchantRepository');

const BUSINESS_FIELDS = {
  name: { type: 'string', required: true, maxLength: 120 },
  cuisine_type: { type: 'string', maxLength: 60, nullable: true },
  description: { type: 'string', maxLength: 1000, nullable: true },
  logo_url: { type: 'string', maxLength: 500, nullable: true },
  address: { type: 'string', maxLength: 500, nullable: true },
  street: { type: 'string', maxLength: 200, nullable: true },
  building_number: { type: 'string', maxLength: 100, nullable: true },
  // Location is mandatory: absent keys are fine on a partial PATCH, but an
  // explicit null (clearing the pin) is rejected. See updateProfile.
  lat: { type: 'number', min: -90, max: 90 },
  lng: { type: 'number', min: -180, max: 180 },
};

const CATEGORY_FIELDS = {
  name: { type: 'string', maxLength: 80 },
  sort_order: { type: 'integer', min: 0, max: 1000 },
  is_active: { type: 'boolean' },
};

const ITEM_FIELDS = {
  category_id: { type: 'string', maxLength: 60, nullable: true },
  name: { type: 'string', maxLength: 120 },
  description: { type: 'string', maxLength: 1000, nullable: true },
  price: { type: 'number', min: 0.01, max: 100000 },
  item_type: { type: 'string', enum: ['meal_package', 'drink_dessert_addon'] },
  image_url: { type: 'string', maxLength: 500, nullable: true },
  is_available: { type: 'boolean' },
  // Drink sizes: validated field-by-field in lib/foodSizes.
  size_options: { type: 'array', itemType: 'object', maxItems: 6, nullable: true },
};

// Vertical-agnostic endpoint for admin vertical selection and portal auto-detection.
// Returns the merchant's vertical without enforcing it — admins can access any vertical.
router.get('/me', requireMerchant, async (req, res) => {
  try {
    const data = await merchantRepository.getByOwner(req.merchantOwnerId);
    if (!data) {
      return res.status(404).json({ error: 'No business profile is linked to this account' });
    }
    return res.json({
      merchant: {
        id: data.id,
        name: data.name,
        vertical: data.vertical || 'food',
        isActive: data.is_active,
        status: data.status,
      },
    });
  } catch (err) {
    console.error('merchant /me error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

// Vertical-scoped, mirroring routes/merchantShop.js. Without this a STORE
// owner could drive the restaurant portal against their own merchant row and
// create menu_items/menu_categories hanging off a store. Owner-scoping meant
// it was never cross-tenant, but it is junk data in the wrong vertical and
// exactly the asymmetry the guard was introduced to remove.
router.use(requireMerchantVertical('food'));

router.get('/profile', merchant.getProfile);
router.patch('/profile', validateBody(BUSINESS_FIELDS), merchant.updateProfile);
router.post(
  '/logo/signed-url',
  validateBody({
    file_name: { type: 'string', required: true, maxLength: 200 },
    mime_type: { type: 'string', required: true, maxLength: 80 },
  }),
  merchant.createLogoUploadUrl
);
router.post(
  '/logo/confirm',
  validateBody({
    path: { type: 'string', required: true, maxLength: 300 },
    size_bytes: { type: 'integer', min: 1, max: 10 * 1024 * 1024, nullable: true },
  }),
  merchant.confirmLogoUpload
);
router.post(
  '/menu/items/image/signed-url',
  validateBody({
    file_name: { type: 'string', required: true, maxLength: 200 },
    mime_type: { type: 'string', required: true, maxLength: 80 },
  }),
  merchant.createMenuItemImageUploadUrl
);
router.post(
  '/menu/items/image/confirm',
  validateBody({
    path: { type: 'string', required: true, maxLength: 300 },
    size_bytes: { type: 'integer', min: 1, max: 10 * 1024 * 1024, nullable: true },
  }),
  merchant.confirmMenuItemImageUpload
);
// --- Opening hours + "closed now" (0038) ---
// The merchant id comes from the session, never the request, so a restaurant
// can only ever change its own. Kept OUT of the profile PATCH whitelist
// above: accepting_orders sits next to is_active on merchants, and that
// whitelist exists to stop a merchant listing itself.
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

router.get('/analytics', merchant.getAnalytics);

router.get('/menu', merchant.getMenu);
router.post(
  '/menu/categories',
  validateBody({ ...CATEGORY_FIELDS, name: { ...CATEGORY_FIELDS.name, required: true } }),
  merchant.addCategory
);
router.patch('/menu/categories/:id', validateBody(CATEGORY_FIELDS), merchant.updateCategory);
router.delete('/menu/categories/:id', merchant.deleteCategory);

router.post(
  '/menu/items',
  validateBody({
    ...ITEM_FIELDS,
    name: { ...ITEM_FIELDS.name, required: true },
    price: { ...ITEM_FIELDS.price, required: true },
    item_type: { ...ITEM_FIELDS.item_type, required: true },
  }),
  merchant.addItem
);
router.patch('/menu/items/:id', validateBody(ITEM_FIELDS), merchant.updateItem);
router.delete('/menu/items/:id', merchant.deleteItem);

// Order management (the restaurant's own live incoming-orders dashboard).
// Merchant authority stops at 'ready' — out_for_delivery/delivered stay
// driver-only (mandatory photo proof) or admin-fallback.
router.get('/orders', merchantOrders.listOrders);
router.post('/orders/:code/accept', merchantOrders.acceptOrder);
router.post(
  '/orders/:code/reject',
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  merchantOrders.rejectOrder
);
router.patch(
  '/orders/:code/status',
  validateBody({ status: { type: 'string', required: true, enum: ['preparing', 'ready'] } }),
  merchantOrders.advanceStatus
);
// Withdraw an order the restaurant already accepted. `reason` is REQUIRED
// here where the admin route leaves it optional: the customer is shown this
// sentence verbatim, and "cancelled, no reason given" is the message this
// endpoint exists to avoid.
router.post(
  '/orders/:code/cancel',
  validateBody({ reason: { type: 'string', required: true, maxLength: 300 } }),
  merchantOrders.cancelOrder
);

module.exports = router;
