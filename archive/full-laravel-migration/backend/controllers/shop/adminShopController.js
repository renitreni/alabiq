// ---------------------------------------------------------------------
// Admin — the Ecommerce (shop) vertical.
//
// Mirrors controllers/food/adminFoodController.js. The whole router sits
// behind requireAdmin, so nothing here re-checks the role.
//
// THIS IS THE ONLY PLACE net_price IS EVER WRITTEN. It is what the store
// keeps; price minus net_price is our markup. The store owner's portal has
// no such field and its route schemas reject it, so admin is the single
// writer by design.
//
// Every merchants query filters vertical = 'shop': the table is shared with
// Food Delivery, and without the filter the Shop tab would list, suspend or
// credit restaurants.
// ---------------------------------------------------------------------
const shopRepository = require('../../repositories/adminShopRepository');
const authRepository = require('../../repositories/authRepository');
const profileRepository = require('../../repositories/profileRepository');
const { hashPassword } = require('../../lib/passwords');
const { config } = require('../../lib/config');
const { round2 } = require('../../lib/foodMoney');
const { logAudit } = require('../../lib/audit');
const { logNotification } = require('../../lib/notifications');
const { pushShopOrderStatus, pushMerchantFeed, pingShopAdmin } = require('../../lib/realtime');
const {
  acceptOrderCore,
  rejectOrderCore,
  advanceOrderStatusCore,
  cancelOrderCore,
  creditView,
} = require('../../lib/shopOrderActions');
const { releaseShopStock, lowStockProducts } = require('../../lib/stock');
const { markShopOrderPaid } = require('./ordersController');
const {
  buildMerchantLogoPath,
  buildMenuItemImagePath,
  createMerchantImageUploadUrl,
  merchantImagePublicUrl,
  createProofDownloadUrl,
} = require('../../lib/storage');
const { passwordError } = require('../../lib/validate');
const { resolveOwnerProfile } = require('../../lib/merchantOwner');

// --- Overview ---------------------------------------------------------
async function getOverview(req, res) {
  try {
    const { orders, stores, awaitingPayments, refundsOwed, outOfStock } =
      await shopRepository.overview();

    const rows = orders || [];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Platform revenue = the markup on orders that actually completed.
    const revenue = rows
      .filter((o) => o.status === 'delivered')
      .reduce((s, o) => s + Number(o.platform_margin_total || 0), 0);

    return res.json({
      ordersToday: rows.filter((o) => new Date(o.created_at) >= startOfToday).length,
      totalOrders: rows.length,
      platformRevenue: round2(revenue),
      stores: (stores || []).length,
      suspended: (stores || []).filter((s) => s.status === 'suspended').length,
      paymentsToVerify: awaitingPayments || 0,
      // Money the platform still owes back. Beside paymentsToVerify
      // because it is the same kind of debt, in the other direction.
      refundsOwed: refundsOwed || 0,
      outOfStockProducts: outOfStock || 0,
    });
  } catch (err) {
    console.error('admin shop getOverview error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Stores -----------------------------------------------------------
async function listStores(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    
    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    const { rows, total } = await shopRepository.listStores({
      limit, offset, search, sortBy, sortOrder, filters: filtersObj,
    });

    // Owner emails, so the admin can see which stores still need an account.
    const ownerIds = [...new Set((rows || []).map((m) => m.owner_id).filter(Boolean))];
    const emails = new Map();
    if (ownerIds.length) {
      const owners = await shopRepository.emailsByIds(ownerIds);
      for (const o of owners || []) emails.set(o.id, o.email);
    }

    const stores = (rows || []).map((m) => ({
      ...m,
      ownerEmail: m.owner_id ? emails.get(m.owner_id) || null : null,
      credit: creditView(m),
    }));

    return res.json({
      data: stores,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      sort: { sortBy, sortOrder },
      filters: filtersObj,
    });
  } catch (err) {
    console.error('admin listStores error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function createStore(req, res) {
  try {
    // Location is mandatory, exactly as it is for a restaurant: the pin is
    // where the rider collects and what the delivery radius is measured from.
    // This endpoint used to accept a store with no pin at all, and the admin
    // form had no way to set one — so every store went live unpinned and the
    // rider's pickup navigation and the customer's tracking map had nothing
    // to draw.
    if (!Number.isFinite(req.body.lat) || !Number.isFinite(req.body.lng)) {
      return res.status(400).json({
        error: 'Store location is required',
        failure_reason: 'store_location_required',
      });
    }
    const data = await shopRepository.insertStore(req.body);
    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_store_created',
      resourceType: 'merchant',
      resourceId: data.id,
      meta: { name: data.name },
    });
    return res.status(201).json({ store: data });
  } catch (err) {
    console.error('admin createStore error:', err);
    return res.status(500).json({ error: 'Could not create the store' });
  }
}

async function updateStore(req, res) {
  try {
    const current = await shopRepository.loadStore(req.params.id);
    if (!current) return res.status(404).json({ error: 'Store not found' });

    // A store cannot be LISTED without a pin — same rule as updateMerchant.
    // Scoped to listing rather than to every edit so the stores that already
    // exist unpinned can still be renamed, suspended or unlisted; they just
    // have to be pinned in the request that puts them in front of customers.
    const nextLat = req.body.lat != null ? req.body.lat : current.lat;
    const nextLng = req.body.lng != null ? req.body.lng : current.lng;
    const willBeActive = req.body.is_active != null ? req.body.is_active : current.is_active;
    if (willBeActive && (!Number.isFinite(nextLat) || !Number.isFinite(nextLng))) {
      return res.status(400).json({
        error: 'Set the store location before listing it',
        failure_reason: 'store_location_required',
      });
    }

    const data = await shopRepository.updateStore(req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Store not found' });
    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_store_updated',
      resourceType: 'merchant',
      resourceId: data.id,
      meta: { fields: Object.keys(req.body) },
    });
    return res.json({ store: data });
  } catch (err) {
    console.error('admin updateStore error:', err);
    return res.status(500).json({ error: 'Could not update the store' });
  }
}

async function deleteStore(req, res) {
  try {
    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    await shopRepository.deleteStore(req.params.id);
    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_store_deleted',
      resourceType: 'merchant',
      resourceId: req.params.id,
      meta: { name: store.name },
    });
    return res.json({ deleted: true });
  } catch (err) {
    // 23503 = shop_orders.merchant_id ON DELETE RESTRICT — a store with
    // order history must be unlisted, not deleted, so the history stays
    // truthful.
    if (err && err.code === '23503') {
      return res.status(409).json({
        error: 'This store has order history and cannot be deleted. Unlist it instead.',
      });
    }
    console.error('admin deleteStore error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function suspendStore(req, res) {
  try {
    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    await shopRepository.setStoreStatus(store.id, 'suspended');
    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_store_suspended',
      resourceType: 'merchant',
      resourceId: store.id,
      meta: { reason: req.body.reason || null },
    });
    return res.json({ suspended: true });
  } catch (err) {
    console.error('admin suspendStore error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function reactivateStore(req, res) {
  try {
    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    await shopRepository.setStoreStatus(store.id, 'active');
    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_store_reactivated',
      resourceType: 'merchant',
      resourceId: store.id,
    });
    return res.json({ reactivated: true });
  } catch (err) {
    console.error('admin reactivateStore error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// Reconcile the credit line after the store settles what it owes.
async function replenishCredit(req, res) {
  try {
    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const amount = round2(Number(req.body.amount));
    const before = round2(Number(store.credit_used));
    const after = round2(Math.max(0, before - amount));

    const applied = await shopRepository.replenishStoreCredit({
      id: store.id,
      after,
      status: after < Number(store.credit_limit) ? 'active' : store.status,
      expectedCreditUsed: store.credit_used,
    });
    if (!applied) {
      return res.status(409).json({ error: 'The credit balance changed — please retry' });
    }

    await shopRepository.insertCreditLedger({
      merchantId: store.id,
      type: 'replenish',
      amount,
      balanceAfter: after,
      note: req.body.note || 'Admin reconciliation',
      createdBy: req.adminId,
      shopOrderId: null,
    });
    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_credit_replenished',
      resourceType: 'merchant',
      resourceId: store.id,
      meta: { amount, before, after },
    });
    return res.json({ credit: creditView({ ...store, credit_used: after }) });
  } catch (err) {
    console.error('admin replenishCredit error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function createStoreImageUploadUrl(req, res) {
  try {
    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const kind = req.body.kind === 'logo' ? 'logo' : 'item';
    const path = kind === 'logo'
      ? buildMerchantLogoPath(store.id, req.body.file_name)
      : buildMenuItemImagePath(store.id, req.body.file_name);
    const { token, signedUrl } = await createMerchantImageUploadUrl(path);
    return res.status(201).json({
      bucket: config.merchantImages.bucket,
      path,
      token,
      signedUrl,
      publicUrl: merchantImagePublicUrl(path),
      maxBytes: config.merchantImages.maxBytes,
    });
  } catch (err) {
    console.error('admin createStoreImageUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

// Provision the owner account. Mirrors the food flow exactly, including the
// admin-chosen permanent password (see setMerchantOwner for the rationale).
async function setStoreOwner(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });

    const password = String(req.body.password || '');
    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (store.owner_id) {
      return res.status(409).json({
        error: 'This store already has an owner account linked. Unlink it first to change it.',
      });
    }

    // Never point this flow at a staff account — see lib/merchantOwner.js.
    const { error: guardErr, status: guardStatus, profile: existingProfile } =
      await resolveOwnerProfile(email);
    if (guardErr) return res.status(guardStatus).json({ error: guardErr });

    let ownerId = null;
    let reusedExistingAccount = false;
    if (existingProfile) {
      const existingUser = await authRepository.getUserById(existingProfile.id);
      if (!existingUser) return res.status(409).json({ error: 'Account is not available for linking.' });
      ownerId = existingProfile.id;
      reusedExistingAccount = true;
      await authRepository.updatePassword(ownerId, await hashPassword(password));
      await authRepository.setDisabled(ownerId, false);
    } else {
      if (await authRepository.getUserByEmail(email)) {
        return res.status(409).json({ error: 'An account with this email exists but could not be linked. Please check the address.' });
      }
      const created = await authRepository.createUser({ email, passwordHash: await hashPassword(password) });
      ownerId = created.id;
    }

    // The merchant role is granted ONLY here and in its food twin — it is not
    // self-selectable at signup (handbook §13.3.4).
    await profileRepository.upsertProfile({
      id: ownerId,
      role: 'merchant',
      email,
      full_name: req.body.full_name || null,
      mobile_number: req.body.phone || null,
    });
    await shopRepository.linkStoreOwner(store.id, ownerId);

    // Audit meta carries WHO was linked, never the password.
    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_owner_linked',
      resourceType: 'merchant',
      resourceId: store.id,
      meta: { owner_id: ownerId, email, reused_existing_account: reusedExistingAccount },
    });

    return res.status(201).json({
      ownerId,
      email,
      storeId: store.id,
      reusedExistingAccount,
    });
  } catch (err) {
    console.error('admin setStoreOwner error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// POST /api/admin/shop/stores/:id/owner/password
//   body: { password }
//
// Recovery path for a store owner who lost their password. Twin of
// setMerchantOwnerPassword in the food controller.
async function setStoreOwnerPassword(req, res) {
  try {
    const password = String((req.body || {}).password || '');
    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!store.owner_id) {
      return res.status(409).json({
        error: 'This store has no owner account yet. Assign an owner first.',
      });
    }

    const updated = await authRepository.updatePassword(store.owner_id, await hashPassword(password));
    if (!updated) {
      return res.status(500).json({ error: 'Could not update the owner password' });
    }

    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_owner_password_set',
      resourceType: 'merchant',
      resourceId: store.id,
      meta: { owner_id: store.owner_id },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('admin setStoreOwnerPassword error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Catalogue (the ONLY net_price writer) ----------------------------
async function getStoreCatalogue(req, res) {
  try {
    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = (req.query.sortOrder || 'asc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const search = (req.query.search || '').trim();

    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    const result = await shopRepository.catalogue(store.id, {
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      filters: filtersObj,
    });

    return res.json({
      store,
      categories: result.data.categories || [],
      products: result.data.products || [],
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('admin getStoreCatalogue error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function addCategory(req, res) {
  try {
    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const data = await shopRepository.insertCategory(store.id, req.body);
    return res.status(201).json({ category: data });
  } catch (err) {
    console.error('admin addCategory error:', err);
    return res.status(500).json({ error: 'Could not add the category' });
  }
}

async function updateCategory(req, res) {
  try {
    const data = await shopRepository.updateCategory(req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Category not found' });
    return res.json({ category: data });
  } catch (err) {
    console.error('admin updateCategory error:', err);
    return res.status(500).json({ error: 'Could not update the category' });
  }
}

async function deleteCategory(req, res) {
  try {
    await shopRepository.deleteCategory(req.params.id);
    return res.json({ deleted: true });
  } catch (err) {
    console.error('admin deleteCategory error:', err);
    return res.status(500).json({ error: 'Could not delete the category' });
  }
}

// net_price arrives here and NOWHERE else in the codebase.
async function addProduct(req, res) {
  try {
    const store = await shopRepository.loadStore(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const data = await shopRepository.insertProduct(store.id, req.body);
    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_product_added',
      resourceType: 'product',
      resourceId: data.id,
      meta: { name: data.name, price: data.price, net_price: data.net_price },
    });
    return res.status(201).json({ product: data });
  } catch (err) {
    // 23514 = products_net_price_range: net_price must be > 0 and <= price.
    if (err && err.code === '23514') {
      return res.status(422).json({
        error: 'The net price must be greater than zero and no more than the list price.',
      });
    }
    console.error('admin addProduct error:', err);
    return res.status(500).json({ error: 'Could not add the product' });
  }
}

async function updateProduct(req, res) {
  try {
    const data = await shopRepository.updateProduct(req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Product not found' });
    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_product_updated',
      resourceType: 'product',
      resourceId: data.id,
      meta: { fields: Object.keys(req.body) },
    });
    return res.json({ product: data });
  } catch (err) {
    if (err && err.code === '23514') {
      return res.status(422).json({
        error: 'The net price must be greater than zero and no more than the list price.',
      });
    }
    console.error('admin updateProduct error:', err);
    return res.status(500).json({ error: 'Could not update the product' });
  }
}

async function deleteProduct(req, res) {
  try {
    await shopRepository.deleteProduct(req.params.id);
    return res.json({ deleted: true });
  } catch (err) {
    if (err && err.code === '23503') {
      return res.status(409).json({
        error: 'This product could not be deleted. Mark it unavailable instead.',
      });
    }
    console.error('admin deleteProduct error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function upsertVariant(req, res) {
  try {
    const data = req.params.variantId
      ? await shopRepository.updateVariant(req.params.variantId, req.params.id, req.body)
      : await shopRepository.insertVariant(req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Option not found' });
    return res.json({ variant: data });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'That SKU is already used by another option' });
    }
    if (err && err.code === '23514') {
      return res.status(422).json({
        error: 'An option with a net price must also set its own price, and the net price cannot exceed it.',
      });
    }
    console.error('admin upsertVariant error:', err);
    return res.status(500).json({ error: 'Could not save the option' });
  }
}

async function deleteVariant(req, res) {
  try {
    await shopRepository.deleteVariant(req.params.variantId, req.params.id);
    return res.json({ deleted: true });
  } catch (err) {
    if (err && err.code === '23503') return res.status(409).json({ error: 'Could not delete the option' });
    console.error('admin deleteVariant error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function getInventory(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const sortBy = req.query.sortBy || 'stock_quantity';
    const sortOrder = (req.query.sortOrder || 'asc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const search = (req.query.search || '').trim();

    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    // Support merchantId filter
    if (req.query.merchant_id) {
      filtersObj.merchantId = req.query.merchant_id;
    }

    // Support lowStockOnly filter
    if (req.query.low_stock_only === 'true') {
      filtersObj.lowStockOnly = true;
    }

    const result = await shopRepository.getInventory({
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      filters: filtersObj,
    });

    return res.json({
      products: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('admin shop getInventory error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Orders -----------------------------------------------------------
async function listOrders(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    
    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    // Backward compatibility: status, merchant_id
    const status = filtersObj.status || req.query.status;
    const merchantId = filtersObj.merchant_id || req.query.merchant_id;

    const result = await shopRepository.listOrders({
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      status,
      merchantId,
      filters: filtersObj,
    });

    const rows = result.data;

    // Transform to match the expected format
    const orders = (rows || []).map((o) => {
      const delivery = Array.isArray(o.deliveries) ? o.deliveries[0] : o.deliveries;
      const subtotal = round2(Number(o.subtotal));
      const markup = round2(Number(o.platform_margin_total));
      return {
        orderCode: o.order_code,
        date: o.created_at,
        store: o.merchants ? o.merchants.name : null,
        subtotal,
        storePayout: round2(subtotal - markup),
        platformMarkup: markup,
        deliveryCharge: round2(Number(o.delivery_fee)),
        driverFee: round2(Number(o.driver_fee || 0)),
        platformDeliveryShare: round2(Number(o.delivery_fee) - Number(o.driver_fee || 0)),
        vat: round2(Number(o.vat_amount || 0)),
        total: round2(Number(o.total)),
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        collectedBy: o.payment_method === 'cash' ? 'cash_rider' : 'platform_online',
        status: o.status,
        merchantId: o.merchant_id,
        customerName: o.profiles ? o.profiles.full_name : null,
        items: o.order_items || [],
        createdAt: o.created_at,
      };
    });

    return res.json({
      data: orders,
      pagination: result.pagination,
      sort: { sortBy, sortOrder },
      filters: filtersObj,
    });
  } catch (err) {
    console.error('admin shop listOrders error:', err);
    return res.status(500).json({ error: 'Could not load orders' });
  }
}

// GET /api/admin/shop/refunds — orders the platform owes money back on.
//
// "Owed" is derived, not stored: cancelled or rejected AND still marked paid.
// That is the exact condition refundPayment enforces, so a second flag column
// would only be somewhere for the two to disagree.
//
// Cash never appears here: payment_status only reaches 'paid' when the rider
// collects at the door, which a cancelled order never reaches.
async function listRefunds(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const sortBy = req.query.sortBy || 'cancelled_at';
    const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const search = (req.query.search || '').trim();

    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    const result = await shopRepository.listRefunds({
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      filters: filtersObj,
    });

    const refunds = (result.data || []).map((o) => ({
      orderCode: o.order_code,
      status: o.status,
      paymentMethod: o.payment_method,
      total: Number(o.total),
      reason: o.reject_reason,
      cancelledBy: o.cancelled_by,
      cancelledAt: o.cancelled_at || o.created_at,
      store: o.merchants ? o.merchants.name : null,
    }));

    return res.json({
      data: refunds,
      pagination: result.pagination,
      sort: { sortBy, sortOrder },
      filters: filtersObj,
    });
  } catch (err) {
    console.error('admin shop listRefunds error:', err);
    return res.status(500).json({ error: 'Could not load the refund queue' });
  }
}

// The admin fallback path. Delegates to the SAME core the store portal uses,
// so the credit gate and the ledger cannot diverge between the two.
async function acceptOrder(req, res) {
  const { httpStatus, body } = await acceptOrderCore({
    orderCode: req.params.code,
    actorId: req.adminId,
    actorRole: 'admin',
  });
  return res.status(httpStatus).json(body);
}

async function rejectOrder(req, res) {
  const { httpStatus, body } = await rejectOrderCore({
    orderCode: req.params.code,
    actorId: req.adminId,
    actorRole: 'admin',
    reason: req.body.reason || null,
  });
  return res.status(httpStatus).json(body);
}

// Admin gets the FULL ladder, including the rider-only steps, as a support
// fallback for when a rider's app fails mid-delivery.
async function advanceOrderStatus(req, res) {
  const { httpStatus, body } = await advanceOrderStatusCore({
    orderCode: req.params.code,
    status: req.body.status,
    actorId: req.adminId,
    actorRole: 'admin',
  });
  return res.status(httpStatus).json(body);
}

async function cancelOrder(req, res) {
  const { httpStatus, body } = await cancelOrderCore({
    orderCode: req.params.code,
    actorId: req.adminId,
    actorRole: 'admin',
    reason: req.body.reason || null,
  });
  return res.status(httpStatus).json(body);
}

async function verifyPayment(req, res) {
  try {
    const order = await shopRepository.loadOrderRow(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status === 'paid') {
      return res.status(409).json({ error: 'This payment is already verified' });
    }

    // Promote the awaiting proof row rather than inserting a second one.
    const pendingId = await shopRepository.latestAwaitingPaymentId(order.id);
    if (pendingId) {
      await shopRepository.markPaymentPaid(pendingId);
    }

    const result = await markShopOrderPaid(order, {
      provider: order.payment_method,
      transactionId: req.body.reference || null,
      actorId: req.adminId,
      skipPaymentRow: !!pendingId,
    });
    if (result.alreadyPaid) return res.status(409).json({ error: 'This payment is already recorded' });

    return res.json({ orderCode: order.order_code, paymentStatus: 'paid' });
  } catch (err) {
    console.error('admin shop verifyPayment error:', err);
    return res.status(500).json({ error: 'Could not verify the payment' });
  }
}

async function rejectPayment(req, res) {
  try {
    const order = await shopRepository.loadOrderRow(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await shopRepository.setOrderPaymentStatus(order.id, 'failed');
    await shopRepository.failAwaitingPayments(order.id);

    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_payment_rejected',
      resourceType: 'shop_order',
      resourceId: order.order_code,
      meta: { reason: req.body.reason || null },
    });
    logNotification({
      userId: order.customer_id,
      type: 'shop_payment_rejected',
      code: order.order_code,
      shopOrderId: order.id,
    });
    pushShopOrderStatus(order.order_code, { paymentStatus: 'failed' });
    pingShopAdmin(order.order_code);
    return res.json({ orderCode: order.order_code, paymentStatus: 'failed' });
  } catch (err) {
    console.error('admin shop rejectPayment error:', err);
    return res.status(500).json({ error: 'Could not reject the payment' });
  }
}

// Refunding releases the stock too — the goods are coming back to the store.
async function refundPayment(req, res) {
  try {
    const order = await shopRepository.loadOrderRow(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status !== 'paid') {
      return res.status(409).json({ error: 'Only a paid order can be refunded' });
    }

    await shopRepository.setOrderPaymentStatus(order.id, 'refunded');
    await shopRepository.refundPaidPayments(order.id);

    const release = await releaseShopStock(order.id);

    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_payment_refunded',
      resourceType: 'shop_order',
      resourceId: order.order_code,
      meta: { amount: Number(order.total), stock_released: release.released },
    });
    pushShopOrderStatus(order.order_code, { paymentStatus: 'refunded' });
    pushMerchantFeed(order.merchant_id, 'payment_update', {
      orderCode: order.order_code,
      paymentStatus: 'refunded',
    });
    pingShopAdmin(order.order_code);
    return res.json({ orderCode: order.order_code, paymentStatus: 'refunded', stockReleased: release.released });
  } catch (err) {
    console.error('admin shop refundPayment error:', err);
    return res.status(500).json({ error: 'Could not refund the payment' });
  }
}

// Manual rider assignment, for when the cascade cannot place a job.
async function assignDriver(req, res) {
  try {
    const order = await shopRepository.loadOrderRow(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const driver = await shopRepository.driverById(req.body.driver_id);
    if (!driver || driver.role !== 'driver') {
      return res.status(400).json({ error: 'That account is not a driver' });
    }
    if (!driver.driver_approved) {
      return res.status(400).json({ error: 'That driver is not approved yet' });
    }

    await shopRepository.upsertDelivery({ orderId: order.id, driverId: driver.id, status: 'assigned' });

    logAudit({
      actorId: req.adminId,
      action: 'admin_shop_driver_assigned',
      resourceType: 'shop_order',
      resourceId: order.order_code,
      meta: { driver_id: driver.id },
    });
    logNotification({ userId: order.customer_id, type: 'shop_rider_assigned', code: order.order_code });
    logNotification({ userId: driver.id, type: 'shop_delivery_assigned', code: order.order_code });
    pushShopOrderStatus(order.order_code, { status: order.status, rider: { name: driver.full_name, status: 'assigned' } });
    pingShopAdmin(order.order_code);
    return res.json({ assigned: true, driverId: driver.id });
  } catch (err) {
    console.error('admin shop assignDriver error:', err);
    return res.status(500).json({ error: 'Could not assign the rider' });
  }
}

// Short-lived signed URLs for the rider's proof photos (private bucket).
async function getOrderPhotos(req, res) {
  try {
    const order = await shopRepository.loadOrderRow(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const delivery = await shopRepository.deliveryPhotos(order.id);
    if (!delivery) return res.json({ pickupUrl: null, deliveryUrl: null });

    const [pickupUrl, deliveryUrl] = await Promise.all([
      delivery.pickup_photo_path ? createProofDownloadUrl(delivery.pickup_photo_path) : null,
      delivery.delivery_photo_path ? createProofDownloadUrl(delivery.delivery_photo_path) : null,
    ]);
    return res.json({ pickupUrl, deliveryUrl });
  } catch (err) {
    console.error('admin shop getOrderPhotos error:', err);
    return res.status(500).json({ error: 'Could not load the photos' });
  }
}

// --- Settlement -------------------------------------------------------
// Per order: store_payout = subtotal - platform_markup. Cash orders were
// collected by the rider; online orders are money we hold and owe the store.
// VAT is excluded from both sides — it belongs to the tax authority.
const PAGE = 1000;
const MAX_ROWS = 50000;

async function getSettlement(req, res) {
  try {
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: 'from and to dates are required' });
    }
    if ((to - from) / 86400000 > 400) {
      return res.status(422).json({ error: 'Please choose a range of 400 days or less' });
    }

    const rows = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      const page = await shopRepository.settlementPage({ from, to, limit: PAGE, offset });
      rows.push(...page);
      if (!page.length || page.length < PAGE) break;
    }

    const orders = rows.map((o) => {
      const subtotal = round2(Number(o.subtotal));
      const markup = round2(Number(o.platform_margin_total));
      return {
        orderCode: o.order_code,
        date: o.created_at,
        store: o.merchants ? o.merchants.name : null,
        subtotal,
        storePayout: round2(subtotal - markup),
        platformMarkup: markup,
        deliveryCharge: round2(Number(o.delivery_fee)),
        // Mirrors the food report: the delivery fee is split, and the
        // rider's share is read off the row rather than recomputed.
        driverFee: round2(Number(o.driver_fee || 0)),
        platformDeliveryShare: round2(Number(o.delivery_fee) - Number(o.driver_fee || 0)),
        vat: round2(Number(o.vat_amount || 0)),
        total: round2(Number(o.total)),
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        collectedBy: o.payment_method === 'cash' ? 'cash_rider' : 'platform_online',
      };
    });

    const totals = orders.reduce(
      (acc, o) => {
        if (o.paymentStatus === 'refunded') {
          acc.refundedAmount = round2(acc.refundedAmount + o.total);
          return acc;
        }
        if (o.collectedBy === 'cash_rider') {
          acc.cashCollectedByRider = round2(acc.cashCollectedByRider + o.total);
          acc.cashStorePayout = round2(acc.cashStorePayout + o.storePayout);
          acc.cashMarkup = round2(acc.cashMarkup + o.platformMarkup);
          acc.driverKeptFromCash = round2(acc.driverKeptFromCash + o.driverFee);
        } else {
          acc.onlineOwedToStore = round2(acc.onlineOwedToStore + o.storePayout);
          acc.onlineMarkupKept = round2(acc.onlineMarkupKept + o.platformMarkup);
          acc.driverPayoutOwed = round2(acc.driverPayoutOwed + o.driverFee);
        }
        acc.platformDeliveryShare = round2(acc.platformDeliveryShare + o.platformDeliveryShare);
        acc.vatCollected = round2(acc.vatCollected + o.vat);
        return acc;
      },
      {
        onlineOwedToStore: 0,
        onlineMarkupKept: 0,
        cashCollectedByRider: 0,
        cashStorePayout: 0,
        cashMarkup: 0,
        // Prepaid: we hold the cash and owe the rider their share. Cash:
        // they already kept it. Opposite directions — never netted.
        driverPayoutOwed: 0,
        driverKeptFromCash: 0,
        platformDeliveryShare: 0,
        vatCollected: 0,
        refundedAmount: 0,
      }
    );

    return res.json({ orders, totals, count: orders.length });
  } catch (err) {
    console.error('admin shop getSettlement error:', err);
    return res.status(500).json({ error: 'Could not build the settlement report' });
  }
}

module.exports = {
  getOverview,
  listRefunds,
  listStores,
  createStore,
  updateStore,
  deleteStore,
  suspendStore,
  reactivateStore,
  replenishCredit,
  createStoreImageUploadUrl,
  setStoreOwner,
  setStoreOwnerPassword,
  getStoreCatalogue,
  addCategory,
  updateCategory,
  deleteCategory,
  addProduct,
  updateProduct,
  deleteProduct,
  upsertVariant,
  deleteVariant,
  getInventory,
  listOrders,
  acceptOrder,
  rejectOrder,
  advanceOrderStatus,
  cancelOrder,
  verifyPayment,
  rejectPayment,
  refundPayment,
  assignDriver,
  getOrderPhotos,
  getSettlement,
};
