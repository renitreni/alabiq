// ---------------------------------------------------------------------
// Food Delivery — admin oversight (extends routes/admin.js)
//   - getOverview       : GET  /api/admin/food/overview
//   - listMerchants     : GET  /api/admin/food/merchants
//   - suspendMerchant   : POST /api/admin/food/merchants/:id/suspend
//   - reactivateMerchant: POST /api/admin/food/merchants/:id/reactivate
//   - replenishCredit   : POST /api/admin/food/merchants/:id/credit
//   - getMerchantMenu   : GET  /api/admin/food/merchants/:id/menu
//   - moderateItem      : PATCH/DELETE /api/admin/food/items/:id
//   - listOrders        : GET  /api/admin/food/orders
//   - verifyPayment     : POST /api/admin/food/orders/:code/verify-payment
//   - rejectPayment     : POST /api/admin/food/orders/:code/reject-payment
//
// Every action here is a privileged admin operation -> audit-logged.
// ---------------------------------------------------------------------
const foodRepository = require('../../repositories/adminFoodRepository');
const authRepository = require('../../repositories/authRepository');
const profileRepository = require('../../repositories/profileRepository');
const { hashPassword } = require('../../lib/passwords');
const { config } = require('../../lib/config');
const { round2 } = require('../../lib/foodMoney');
const { logFoodEvent } = require('../../lib/foodEvents');
const { logAudit } = require('../../lib/audit');
const { logNotification } = require('../../lib/notifications');
const { pushFoodOrderStatus, pushMerchantFeed, pingFoodAdmin } = require('../../lib/realtime');
const { markOrderPaid } = require('./ordersController');
const {
  acceptOrderCore,
  rejectOrderCore,
  advanceOrderStatusCore,
  cancelOrderCore,
} = require('../../lib/foodOrderActions');
const {
  buildMerchantImagePath,
  createMerchantImageUploadUrl,
  merchantImagePublicUrl,
  createProofDownloadUrl,
} = require('../../lib/storage');
const { validateImageFile, validateMenuImageFile } = require('../../lib/uploadValidation');
const { normalizeSizeOptions } = require('../../lib/foodSizes');
const { passwordError } = require('../../lib/validate');
const { resolveOwnerProfile } = require('../../lib/merchantOwner');

// Credit summary for a restaurant (used / limit / warning / suspended).
function creditView(merchant) {
  const limit = Number(merchant.credit_limit);
  const used = round2(Number(merchant.credit_used));
  const alertAt = round2(limit * config.food.creditAlertPct);
  return {
    creditLimit: limit,
    creditUsed: used,
    creditRemaining: round2(Math.max(0, limit - used)),
    alertAt,
    warning: used >= alertAt && used < limit,
    exhausted: used >= limit,
    suspended: merchant.status === 'suspended',
  };
}

// --- Overview ---------------------------------------------------------
async function getOverview(req, res) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const {
      orders, totalOrders, todayOrders, merchants, pendingPayments, refundsOwed,
    } = await foodRepository.overview({ todayStart: todayStart.toISOString() });

    const rows = orders || [];
    // Platform revenue = the per-item margins of orders that went through
    // (everything a merchant accepted; rejected/cancelled never charged).
    const revenueRows = rows.filter((o) => !['pending', 'cancelled', 'rejected'].includes(o.status));
    const merchantsRows = merchants || [];

    return res.json({
      totalOrders: totalOrders || 0,
      todayOrders: todayOrders || 0,
      delivered: rows.filter((o) => o.status === 'delivered').length,
      pending: rows.filter((o) => o.status === 'pending').length,
      revenue: round2(revenueRows.reduce((sum, o) => sum + Number(o.platform_margin_total || 0), 0)),
      orderVolume: round2(revenueRows.reduce((sum, o) => sum + Number(o.total || 0), 0)),
      merchants: merchantsRows.length,
      suspendedMerchants: merchantsRows.filter((m) => m.status === 'suspended').length,
      atCreditWarning: merchantsRows.filter(
        (m) => Number(m.credit_used) >= Number(m.credit_limit) * 0.8 && m.status !== 'suspended'
      ).length,
      paymentsAwaitingReview: pendingPayments || 0,
      // Money the platform still owes back. Beside paymentsAwaitingReview
      // because it is the same kind of debt, in the other direction.
      refundsOwed: refundsOwed || 0,
    });
  } catch (err) {
    console.error('food getOverview error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// GET /api/admin/food/refunds — orders the platform owes money back on.
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

    const result = await foodRepository.listRefunds({
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      filters: filtersObj,
    });

    return res.json({
      data: (result.data || []).map((o) => ({
        orderCode: o.order_code,
        status: o.status,
        paymentMethod: o.payment_method,
        total: Number(o.total),
        reason: o.reject_reason,
        cancelledBy: o.cancelled_by,
        cancelledAt: o.cancelled_at || o.created_at,
        merchant: o.merchants ? o.merchants.name : null,
      })),
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('admin food listRefunds error:', err);
    return res.status(500).json({ error: 'Could not load the refund queue' });
  }
}

// --- Merchant management ------------------------------------------------
async function listMerchants(req, res) {
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

    const { rows, total } = await foodRepository.listMerchants({
      limit, offset, search, sortBy, sortOrder, filters: filtersObj,
    });

    // Resolve owner emails
    const ownerIds = [...new Set((rows || []).map((m) => m.owner_id).filter(Boolean))];
    const ownerEmailById = new Map();
    if (ownerIds.length) {
      const owners = await foodRepository.emailsByIds(ownerIds);
      for (const o of owners || []) ownerEmailById.set(o.id, o.email);
    }

    const merchants = (rows || []).map((m) => ({
      id: m.id,
      name: m.name,
      cuisineType: m.cuisine_type,
      description: m.description,
      logoUrl: m.logo_url,
      address: m.address,
      street: m.street,
      buildingNumber: m.building_number,
      lat: m.lat,
      lng: m.lng,
      isActive: m.is_active,
      status: m.status,
      acceptingOrders: m.accepting_orders !== false,
      creditLimit: Number(m.credit_limit),
      creditUsed: round2(Number(m.credit_used)),
      isFeatured: m.is_featured,
      badge: m.badge,
      ownerId: m.owner_id,
      ownerEmail: m.owner_id ? ownerEmailById.get(m.owner_id) || null : null,
      createdAt: m.created_at,
    }));

    return res.json({
      data: merchants,
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
    console.error('food listMerchants error:', err);
    return res.status(500).json({ error: 'Could not load merchants' });
  }
}

// --- Admin-driven onboarding: restaurants contact Alabiq and an admin
// creates them + imports the menu. owner_id is linked later (nullable).
async function createMerchant(req, res) {
  try {
    // Location is mandatory so drivers know where to pick up and the 15 km
    // delivery radius is enforceable (an unpinned merchant would bypass it).
    if (!Number.isFinite(req.body.lat) || !Number.isFinite(req.body.lng)) {
      return res.status(400).json({
        error: 'Restaurant location is required',
        failure_reason: 'restaurant_location_required',
      });
    }
    const data = await foodRepository.insertMerchant(req.body);
    logAudit({
      actorId: req.adminId,
      action: 'admin_merchant_created',
      resourceType: 'merchant',
      resourceId: data.id,
      meta: { name: data.name },
    });
    return res.status(201).json({ merchant: data });
  } catch (err) {
    console.error('admin createMerchant error:', err);
    return res.status(500).json({ error: 'Could not create the restaurant' });
  }
}

async function updateMerchant(req, res) {
  try {
    const current = await foodRepository.loadMerchant(req.params.id);
    if (!current) return res.status(404).json({ error: 'Merchant not found' });

    // A restaurant cannot be listed (visible + orderable) without a pin.
    // The route already rejects an explicit null lat/lng, so this only bites
    // legacy unpinned rows: they must be pinned in the same request that
    // lists them (or before). Unlisting / other edits stay unblocked.
    const nextLat = req.body.lat != null ? req.body.lat : current.lat;
    const nextLng = req.body.lng != null ? req.body.lng : current.lng;
    const willBeActive = req.body.is_active != null ? req.body.is_active : current.is_active;
    if (willBeActive && (!Number.isFinite(nextLat) || !Number.isFinite(nextLng))) {
      return res.status(400).json({
        error: 'Set the restaurant location before listing it',
        failure_reason: 'restaurant_location_required',
      });
    }

    const data = await foodRepository.updateMerchant(req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Merchant not found' });
    logAudit({
      actorId: req.adminId,
      action: 'admin_merchant_updated',
      resourceType: 'merchant',
      resourceId: data.id,
      meta: req.body,
    });
    return res.json({ merchant: data });
  } catch (err) {
    console.error('admin updateMerchant error:', err);
    return res.status(500).json({ error: 'Could not update the restaurant' });
  }
}

async function deleteMerchant(req, res) {
  try {
    // Refuse while live orders exist — history stays intact otherwise
    // because orders reference merchants with ON DELETE RESTRICT.
    const liveCount = await foodRepository.liveOrderCount(req.params.id);
    if (liveCount > 0) {
      return res.status(409).json({ error: 'This restaurant still has live orders' });
    }

    await foodRepository.deleteMerchant(req.params.id);
    logAudit({
      actorId: req.adminId,
      action: 'admin_merchant_deleted',
      resourceType: 'merchant',
      resourceId: req.params.id,
    });
    return res.json({ deleted: true });
  } catch (err) {
    // 23503 = FK restrict from historical orders: unlist instead of deleting.
    if (err && err.code === '23503') {
      return res.status(409).json({
        error: 'This restaurant has order history and cannot be deleted. Unlist it instead.',
      });
    }
    console.error('admin deleteMerchant error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Admin menu import/CRUD (any restaurant) ----------------------------

async function addCategoryForMerchant(req, res) {
  try {
    const merchant = await foodRepository.loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
    const data = await foodRepository.insertCategory(merchant.id, req.body);
    logAudit({
      actorId: req.adminId,
      action: 'admin_menu_category_created',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { name: data.name },
    });
    return res.status(201).json({ category: data });
  } catch (err) {
    console.error('admin addCategory error:', err);
    return res.status(500).json({ error: 'Could not create the category' });
  }
}

async function updateAnyCategory(req, res) {
  try {
    const data = await foodRepository.updateCategory(req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Category not found' });
    return res.json({ category: data });
  } catch (err) {
    console.error('admin updateCategory error:', err);
    return res.status(500).json({ error: 'Could not update the category' });
  }
}

async function deleteAnyCategory(req, res) {
  try {
    await foodRepository.deleteCategory(req.params.id);
    return res.json({ deleted: true });
  } catch (err) {
    console.error('admin deleteCategory error:', err);
    return res.status(500).json({ error: 'Could not delete the category' });
  }
}

async function addItemForMerchant(req, res) {
  try {
    const merchant = await foodRepository.loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
    const b = req.body;
    // Markup must be >= 0: the restaurant's net can't exceed the list price.
    // (DB CHECK backs this up; this yields a clean 400 instead of a 500.)
    if (b.net_price != null && Number(b.net_price) > Number(b.price)) {
      return res.status(400).json({ error: 'net_price must be <= price' });
    }
    if ('size_options' in b) {
      const sized = normalizeSizeOptions(b.size_options);
      if (!sized.ok) return res.status(400).json({ error: sized.error });
      b.size_options = sized.value;
    }
    if (b.category_id) {
      const cat = await foodRepository.categoryForMerchant(b.category_id);
      if (!cat || cat.merchant_id !== merchant.id) {
        return res.status(400).json({ error: 'category_id does not belong to this restaurant' });
      }
    }
    const data = await foodRepository.insertItem(merchant.id, b);
    logAudit({
      actorId: req.adminId,
      action: 'admin_menu_item_created',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { name: data.name, price: data.price },
    });
    return res.status(201).json({ item: data });
  } catch (err) {
    console.error('admin addItem error:', err);
    return res.status(500).json({ error: 'Could not create the item' });
  }
}

async function suspendMerchant(req, res) {
  try {
    const merchant = await foodRepository.loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    await foodRepository.setMerchantStatus(merchant.id, 'suspended');

    logAudit({
      actorId: req.adminId,
      action: 'admin_merchant_suspended',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { reason: (req.body && req.body.reason) || null },
    });
    logFoodEvent({
      eventName: 'service_suspended',
      merchantId: merchant.id,
      params: { final_balance: Number(merchant.credit_used), merchant_id: merchant.id },
    });
    logNotification({ userId: merchant.owner_id, type: 'service_suspended' });
    pushMerchantFeed(merchant.id, 'merchant_update', { status: 'suspended' });

    return res.json({ id: merchant.id, status: 'suspended' });
  } catch (err) {
    console.error('suspendMerchant error:', err);
    return res.status(500).json({ error: 'Could not suspend the merchant' });
  }
}

async function reactivateMerchant(req, res) {
  try {
    const merchant = await foodRepository.loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    await foodRepository.setMerchantStatus(merchant.id, 'active');

    logAudit({
      actorId: req.adminId,
      action: 'admin_merchant_reactivated',
      resourceType: 'merchant',
      resourceId: merchant.id,
    });
    pushMerchantFeed(merchant.id, 'merchant_update', { status: 'active' });
    return res.json({ id: merchant.id, status: 'active' });
  } catch (err) {
    console.error('reactivateMerchant error:', err);
    return res.status(500).json({ error: 'Could not reactivate the merchant' });
  }
}

// POST /api/admin/food/merchants/:id/credit { amount, note } — reconcile:
// the merchant settled (part of) what they owe, so credit_used goes DOWN.
async function replenishCredit(req, res) {
  try {
    const merchant = await foodRepository.loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const amount = round2(Number(req.body.amount));
    const newUsed = round2(Math.max(0, Number(merchant.credit_used) - amount));
    // Dropping back under the limit lifts an automatic (credit) suspension.
    const newStatus =
      merchant.status === 'suspended' && newUsed < Number(merchant.credit_limit)
        ? 'active'
        : merchant.status;

    const applied = await foodRepository.replenishMerchantCredit({
      id: merchant.id,
      newUsed,
      newStatus,
      expectedCreditUsed: merchant.credit_used, // CAS against a racing accept
    });
    if (!applied) {
      return res.status(409).json({ error: 'The credit balance changed — please retry' });
    }

    await foodRepository.insertCreditLedger({
      merchantId: merchant.id,
      type: 'replenish',
      amount,
      balanceAfter: newUsed,
      note: (req.body && req.body.note) || null,
      createdBy: req.adminId,
    });

    logAudit({
      actorId: req.adminId,
      action: 'admin_merchant_credit_replenished',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { amount, credit_used_after: newUsed },
    });
    logNotification({ userId: merchant.owner_id, type: 'credit_replenished' });
    pushMerchantFeed(merchant.id, 'merchant_update', { status: newStatus, creditUsed: newUsed });

    return res.json({
      id: merchant.id,
      status: newStatus,
      credit: creditView({ ...merchant, credit_used: newUsed, status: newStatus }),
    });
  } catch (err) {
    console.error('replenishCredit error:', err);
    return res.status(500).json({ error: 'Could not update the credit' });
  }
}

// --- Catalog oversight ----------------------------------------------------
async function getMerchantMenu(req, res) {
  try {
    const merchant = await foodRepository.loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const { categories, items } = await foodRepository.menuForMerchant(merchant.id);
    return res.json({
      merchant: { id: merchant.id, name: merchant.name },
      categories: categories || [],
      items: items || [],
    });
  } catch (err) {
    console.error('getMerchantMenu error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function moderateItem(req, res) {
  try {
    const b = req.body;
    if ('size_options' in b) {
      const sized = normalizeSizeOptions(b.size_options);
      if (!sized.ok) return res.status(400).json({ error: sized.error });
      b.size_options = sized.value;
    }
    // Guard markup >= 0 (net_price <= price). EITHER field may arrive alone on a
    // PATCH — including a price-only lowering below a stored net_price — so
    // resolve the effective PAIR: a field PRESENT in the body (even an explicit
    // null, which CLEARS net_price — validateBody keeps nullable nulls) wins;
    // an ABSENT field falls back to the stored row. Reject with a clean 400 up
    // front rather than the DB CHECK's confusing error.
    const hasNet = 'net_price' in b;
    const hasPrice = 'price' in b;
    if (hasNet || hasPrice) {
      let current = null;
      if (!hasNet || !hasPrice) {
        current = await foodRepository.itemPrices(req.params.id);
        if (!current) return res.status(404).json({ error: 'Menu item not found' });
      }
      const effPrice = hasPrice ? Number(b.price) : Number(current.price);
      const effNet = hasNet
        ? (b.net_price == null ? null : Number(b.net_price))
        : current.net_price == null ? null : Number(current.net_price);
      if (effNet != null && effNet > effPrice) {
        return res.status(400).json({ error: 'net_price must be <= price' });
      }
    }
    const data = await foodRepository.updateItem(req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Menu item not found' });

    logAudit({
      actorId: req.adminId,
      action: 'admin_menu_item_moderated',
      resourceType: 'menu_item',
      resourceId: req.params.id,
      meta: req.body,
    });
    return res.json({ item: data });
  } catch (err) {
    // 23514 = the net_price <= price CHECK — surface it as a clean 400.
    if (err && err.code === '23514') {
      return res.status(400).json({ error: 'net_price must be <= price' });
    }
    console.error('moderateItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function removeItem(req, res) {
  try {
    await foodRepository.deleteItem(req.params.id);
    logAudit({
      actorId: req.adminId,
      action: 'admin_menu_item_deleted',
      resourceType: 'menu_item',
      resourceId: req.params.id,
    });
    return res.json({ deleted: true });
  } catch (err) {
    console.error('admin removeItem error:', err);
    return res.status(500).json({ error: 'Could not delete the item' });
  }
}

// --- Orders + payment reconciliation ---------------------------------------
async function listOrders(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const search = (req.query.search || '').trim();

    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    // Backward compatibility: status, payment_status
    const status = filtersObj.status || req.query.status;
    const paymentStatus = filtersObj.payment_status || req.query.payment_status;

    const offset = (page - 1) * limit;
    const result = await foodRepository.listOrders({
      offset,
      limit,
      sortBy,
      sortOrder,
      search,
      status,
      paymentStatus,
      filters: filtersObj,
    });

    const rows = result.rows;

    // Fetch the proof references for awaiting STC payments in one shot.
    const awaitingIds = (rows || [])
      .filter((o) => o.payment_status === 'awaiting')
      .map((o) => o.id);
    const payments = awaitingIds.length
      ? await foodRepository.awaitingPaymentsForOrders(awaitingIds)
      : [];
    const latestPayment = new Map();
    for (const p of payments || []) {
      if (!latestPayment.has(p.order_id)) latestPayment.set(p.order_id, p);
    }

    // Short-lived signed download URLs so the admin can VIEW the uploaded
    // STC Pay screenshots (mirrors the rides implementation). Best-effort:
    // a broken path must not take the whole list down.
    const proofUrlByOrder = new Map();
    await Promise.all(
      [...latestPayment.entries()].map(async ([orderId, p]) => {
        const proofPath = p.gateway_raw && p.gateway_raw.proof_path;
        if (!proofPath) return;
        try {
          proofUrlByOrder.set(orderId, await createProofDownloadUrl(proofPath));
        } catch (urlErr) {
          console.error('food listOrders proof url error:', urlErr.message || urlErr);
        }
      })
    );

    logAudit({ actorId: req.adminId, action: 'admin_food_orders_read', resourceType: 'orders' });
    const orders = (rows || []).map((o) => {
      const payment = latestPayment.get(o.id);
      const delivery = Array.isArray(o.deliveries) ? o.deliveries[0] : o.deliveries;
      return {
        orderCode: o.order_code,
        status: o.status,
        paymentStatus: o.payment_status,
        paymentMethod: o.payment_method,
        subtotal: o.subtotal,
        deliveryFee: o.delivery_fee,
        marginTotal: o.platform_margin_total,
        vatAmount: o.vat_amount,
        total: o.total,
        deliveryAddress: o.delivery_address,
        deliveryStreet: o.delivery_street,
        deliveryBuilding: o.delivery_building,
        merchantId: o.merchants ? o.merchants.id : null,
        merchantName: o.merchants ? o.merchants.name : null,
        customerName: o.profiles ? o.profiles.full_name : null,
        // Prefer the order's own (editable) contact number over the profile.
        customerMobile: o.contact_phone || (o.profiles ? o.profiles.mobile_number : null),
        items: o.order_items || [],
        riderName: delivery && delivery.profiles ? delivery.profiles.full_name : null,
        deliveryStatus: delivery ? delivery.status : null,
        hasPickupPhoto: !!(delivery && delivery.pickup_photo_path),
        hasDeliveryPhoto: !!(delivery && delivery.delivery_photo_path),
        paymentReference: payment ? payment.gateway_transaction_id : null,
        proofUrl: proofUrlByOrder.get(o.id) || null,
        createdAt: o.created_at,
        acceptedAt: o.accepted_at,
      };
    });

    return res.json({
      data: orders,
      pagination: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
        hasNext: page < Math.ceil(result.total / limit),
        hasPrev: page > 1,
      },
      sort: { sortBy, sortOrder },
      filters: filtersObj,
      preparingReminderMinutes: config.food.preparingReminderMinutes,
    });
  } catch (err) {
    console.error('admin food listOrders error:', err);
    return res.status(500).json({ error: 'Could not load orders' });
  }
}

// POST /api/admin/food/orders/:code/assign-driver { driver_id }
// Grab-style rider leg: attach an approved Pick & Drop driver to the food
// order. The customer's tracking page immediately shows the rider's name
// and call/WhatsApp contact (pushed over the fd-order channel).
async function assignDriver(req, res) {
  try {
    const order = await foodRepository.loadOrderByCode(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (['delivered', 'cancelled', 'rejected'].includes(order.status)) {
      return res.status(409).json({ error: `Cannot assign a rider to a ${order.status} order` });
    }

    const driver = await foodRepository.driverForAssignment(req.body.driver_id);
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({ error: 'Driver not found' });
    }
    if (!driver.driver_approved) {
      return res.status(409).json({ error: 'This driver is not approved yet' });
    }

    await foodRepository.upsertDelivery({
      orderId: order.id,
      driverId: driver.id,
      fee: order.delivery_fee,
      status: 'assigned',
    });

    logAudit({
      actorId: req.adminId,
      action: 'admin_food_driver_assigned',
      resourceType: 'order',
      resourceId: order.order_code,
      meta: { driver_id: driver.id },
    });
    logNotification({
      userId: order.customer_id,
      orderId: order.id,
      type: 'food_rider_assigned',
      code: order.order_code,
      url: `/food/track/${order.order_code}`,
    });
    logNotification({
      userId: driver.id,
      orderId: order.id,
      type: 'food_delivery_assigned',
      code: order.order_code,
      url: '/driver',
    });
    // Live update for the customer's tracking page: safe rider fields only.
    pushFoodOrderStatus(order.order_code, {
      status: order.status,
      rider: {
        name: driver.full_name,
        whatsapp: driver.whatsapp_number,
        mobile: driver.mobile_number,
        status: 'assigned',
      },
    });
    pushMerchantFeed(order.merchant_id, 'order_update', {
      orderCode: order.order_code,
      riderAssigned: true,
    });
    pingFoodAdmin(order.order_code);

    return res.json({
      orderCode: order.order_code,
      rider: { id: driver.id, name: driver.full_name },
    });
  } catch (err) {
    console.error('food assignDriver error:', err);
    return res.status(500).json({ error: 'Could not assign the rider' });
  }
}

async function verifyPayment(req, res) {
  try {
    const order = await foodRepository.loadOrderByCode(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status === 'paid') {
      return res.status(409).json({ error: 'Payment is already verified' });
    }

    // Promote the awaiting proof row (if any) to paid, then mark the order.
    // When a proof row exists it becomes THE payment record, so tell
    // markOrderPaid not to insert a second (duplicate) paid row.
    const promoted = await foodRepository.promoteAwaitingPayments(order.id);
    await markOrderPaid(order, {
      provider: order.payment_method,
      transactionId: order.gateway_transaction_id,
      actorId: req.adminId,
      skipPaymentRow: promoted > 0,
    });

    return res.json({ orderCode: order.order_code, paymentStatus: 'paid' });
  } catch (err) {
    console.error('food verifyPayment error:', err);
    return res.status(500).json({ error: 'Could not verify the payment' });
  }
}

async function rejectPayment(req, res) {
  try {
    const order = await foodRepository.loadOrderByCode(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status === 'paid') {
      return res.status(409).json({ error: 'Payment is already verified; refund instead' });
    }

    await foodRepository.failAwaitingPayments(order.id);
    await foodRepository.setOrderPaymentStatus(order.id, 'failed');

    logAudit({
      actorId: req.adminId,
      action: 'admin_food_payment_rejected',
      resourceType: 'order',
      resourceId: order.order_code,
      meta: { reason: (req.body && req.body.reason) || null },
    });
    pushFoodOrderStatus(order.order_code, { paymentStatus: 'failed' });
    pingFoodAdmin(order.order_code);
    logNotification({ userId: order.customer_id, type: 'food_payment_rejected' });

    return res.json({ orderCode: order.order_code, paymentStatus: 'failed' });
  } catch (err) {
    console.error('food rejectPayment error:', err);
    return res.status(500).json({ error: 'Could not reject the payment' });
  }
}

// --- Order operations (admin-run restaurants: no owner accounts exist, so
// admins accept/reject/advance orders on the restaurant's behalf) ----------

// POST /api/admin/food/orders/:code/accept — THE credit-gated action.
// HARD RULE (PRD §7): a restaurant whose credit_used has reached the 300 SAR
// limit cannot take new orders (403). Accepting charges the order's platform
// margin to the ledger; crossing 80% (240) alerts once; hitting the limit
// suspends the restaurant until reconciled.
async function acceptOrder(req, res) {
  try {
    const { httpStatus, body } = await acceptOrderCore({
      orderCode: req.params.code,
      actorId: req.adminId,
      actorRole: 'admin',
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('admin acceptOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function rejectOrder(req, res) {
  try {
    const { httpStatus, body } = await rejectOrderCore({
      orderCode: req.params.code,
      actorId: req.adminId,
      actorRole: 'admin',
      reason: (req.body && req.body.reason) || null,
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('admin rejectOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function advanceOrderStatus(req, res) {
  try {
    const { httpStatus, body } = await advanceOrderStatusCore({
      orderCode: req.params.code,
      actorId: req.adminId,
      actorRole: 'admin',
      status: req.body.status,
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('admin advanceOrderStatus error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// GET /api/admin/food/orders/:code/photos — short-lived signed URLs for the
// rider's mandatory pickup/delivery proof photos (private bucket).
async function getOrderPhotos(req, res) {
  try {
    const order = await foodRepository.loadOrderByCode(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const delivery = await foodRepository.deliveryPhotos(order.id);
    if (!delivery) return res.json({ pickup: null, delivery: null });

    const [pickup, deliveryPhoto] = await Promise.all([
      delivery.pickup_photo_path ? createProofDownloadUrl(delivery.pickup_photo_path) : null,
      delivery.delivery_photo_path ? createProofDownloadUrl(delivery.delivery_photo_path) : null,
    ]);

    logAudit({
      actorId: req.adminId,
      action: 'admin_food_delivery_photos_viewed',
      resourceType: 'order',
      resourceId: order.order_code,
    });
    return res.json({ pickup, delivery: deliveryPhoto });
  } catch (err) {
    console.error('getOrderPhotos error:', err);
    return res.status(500).json({ error: 'Could not load the photos' });
  }
}

// POST /api/admin/food/orders/:code/cancel — customer-support cancellation.
// If the order was already paid it enters the refund queue (the customer is
// told refunds take a few hours up to one day; /refund below closes it).
// Delegates to the SAME core the restaurant's own dashboard uses, so the
// credit reversal and the refund bookkeeping cannot diverge between the two.
async function cancelOrder(req, res) {
  const { httpStatus, body } = await cancelOrderCore({
    orderCode: req.params.code,
    actorId: req.adminId,
    actorRole: 'admin',
    reason: (req.body && req.body.reason) || null,
    cancelledBy: 'admin',
  });
  return res.status(httpStatus).json(body);
}

// POST /api/admin/food/orders/:code/refund — close the refund after the
// money was actually returned (policy: within a few hours up to one day).
async function refundPayment(req, res) {
  try {
    const order = await foodRepository.loadOrderByCode(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status !== 'paid') {
      return res.status(409).json({ error: `Payment is ${order.payment_status}; nothing to refund` });
    }
    if (!['cancelled', 'rejected'].includes(order.status)) {
      return res.status(409).json({ error: 'Only cancelled or rejected orders can be refunded' });
    }

    await foodRepository.refundPaidPayments(order.id);
    await foodRepository.setOrderPaymentStatus(order.id, 'refunded');

    logAudit({
      actorId: req.adminId,
      action: 'admin_food_payment_refunded',
      resourceType: 'order',
      resourceId: order.order_code,
      meta: { amount: Number(order.total) },
    });
    pushFoodOrderStatus(order.order_code, { paymentStatus: 'refunded' });
    pingFoodAdmin(order.order_code);
    logNotification({ userId: order.customer_id, type: 'food_payment_refunded' });

    return res.json({ orderCode: order.order_code, paymentStatus: 'refunded' });
  } catch (err) {
    console.error('food refundPayment error:', err);
    return res.status(500).json({ error: 'Could not refund the payment' });
  }
}

// --- Merchant images (logo + menu photos) ----------------------------------
// The browser uploads straight to the PUBLIC `merchant-images` bucket via a
// short-lived signed URL, then persists the returned publicUrl into
// merchants.logo_url / menu_items.image_url through the normal update endpoints.
//
// POST /api/admin/food/merchants/:id/image/signed-url
//   body: { kind: 'logo' | 'item', file_name, mime_type }
async function createMerchantImageUploadUrlHandler(req, res) {
  try {
    const { kind, file_name, mime_type } = req.body || {};
    if (!config.merchantImages.kinds.includes(kind)) {
      return res.status(400).json({
        error: `kind is required and must be one of: ${config.merchantImages.kinds.join(', ')}`,
      });
    }
    // Same rules the merchant portal uses: logos allow JPG/PNG/WebP, menu photos
    // are JPG/PNG only.
    const validate = kind === 'item' ? validateMenuImageFile : validateImageFile;
    const fileCheck = validate({ fileName: file_name, mimeType: mime_type });
    if (!fileCheck.ok) {
      return res.status(400).json({ error: fileCheck.error });
    }

    // The image lives under the merchant's id. Confirm the merchant exists so we
    // never leave orphaned objects for a bad id.
    const merchant = await foodRepository.loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const path = buildMerchantImagePath(merchant.id, kind, file_name);
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
    console.error('createMerchantImageUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

// --- Owner account provisioning (contract-signing step) ---------------------
// POST /api/admin/food/merchants/:id/owner
//   body: { email, password, full_name?, phone? }
//
// Restaurants are onboarded by admins: after the contract is signed the admin
// creates (or reuses) the owner's auth account, sets its password, grants it
// the `merchant` role, and links it to the restaurant. There is no
// self-service merchant signup.
//
// The password is CHOSEN BY THE ADMIN and permanent — the admin hands it over
// in person at contract signing. There is no generated temp value and no
// password-reset email (the platform sends no mail at all; every account is
// created with email_confirm). Recovery is setMerchantOwnerPassword below.
async function setMerchantOwner(req, res) {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });

    const password = String(b.password || '');
    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const merchant = await foodRepository.loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
    if (merchant.owner_id) {
      return res.status(409).json({
        error: 'This restaurant already has an owner account linked. Unlink it first if you need to change it.',
      });
    }

    // Never point this flow at a staff account — see lib/merchantOwner.js.
    const { error: guardErr, status: guardStatus, profile: existingProfile } =
      await resolveOwnerProfile(email);
    if (guardErr) return res.status(guardStatus).json({ error: guardErr });

    // Create the auth user with a confirmed email (no confirmation mail). If
    // one already exists, reuse it (the person may already be a customer)
    // and apply the admin's password to it.
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

    await profileRepository.upsertProfile(
      {
        id: ownerId,
        role: 'merchant',
        email,
        full_name: b.full_name ?? null,
        mobile_number: b.phone ?? null,
      },
    );

    const linked = await foodRepository.linkMerchantOwner(merchant.id, ownerId);
    if (!linked) {
      return res.status(500).json({ error: 'Could not link the owner to the restaurant' });
    }

    // Audit meta carries WHO was linked, never the password.
    logAudit({
      actorId: req.adminId,
      action: 'admin_merchant_owner_linked',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { owner_id: ownerId, email, reused_existing_account: reusedExistingAccount },
    });

    return res.status(201).json({
      ownerId,
      email,
      merchantId: merchant.id,
      reusedExistingAccount,
    });
  } catch (err) {
    console.error('setMerchantOwner error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// POST /api/admin/food/merchants/:id/owner/password
//   body: { password }
//
// Recovery path for a restaurant owner who lost their password. Admin-driven
// by design: there is no forgot-password email on this platform.
async function setMerchantOwnerPassword(req, res) {
  try {
    const password = String((req.body || {}).password || '');
    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const merchant = await foodRepository.loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
    if (!merchant.owner_id) {
      return res.status(409).json({
        error: 'This restaurant has no owner account yet. Assign an owner first.',
      });
    }

    const updated = await authRepository.updatePassword(merchant.owner_id, await hashPassword(password));
    if (!updated) {
      return res.status(500).json({ error: 'Could not update the owner password' });
    }

    logAudit({
      actorId: req.adminId,
      action: 'admin_merchant_owner_password_set',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { owner_id: merchant.owner_id },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('setMerchantOwnerPassword error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Settlement report ------------------------------------------------------
// Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD into UTC day boundaries. 'to' is
// inclusive (we filter < the day AFTER it). Defaults: to = today, from = 30
// days before that.
function parseDateRange(query) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const toParam = (query.to || '').toString().trim();
  const fromParam = (query.from || '').toString().trim();

  const toDay = toParam ? new Date(`${toParam}T00:00:00.000Z`) : new Date(today);
  let fromDay;
  if (fromParam) {
    fromDay = new Date(`${fromParam}T00:00:00.000Z`);
  } else {
    fromDay = new Date(toDay);
    fromDay.setUTCDate(fromDay.getUTCDate() - 30);
  }

  // Exclusive upper bound = start of the day AFTER toDay, so toDay is included.
  const toExclusive = new Date(toDay);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  return {
    from: fromDay,
    toExclusive,
    fromLabel: Number.isNaN(fromDay.getTime()) ? null : fromDay.toISOString().slice(0, 10),
    toLabel: Number.isNaN(toDay.getTime()) ? null : toDay.toISOString().slice(0, 10),
  };
}

// GET /api/admin/food/settlement?from=YYYY-MM-DD&to=YYYY-MM-DD
// Per-order + per-restaurant view of what we owe each restaurant (their net
// payout = subtotal - markup) vs. the markup we keep (platform_margin_total),
// split by who collected the money:
//   * online (stcpay/tap) -> the PLATFORM holds the cash, we owe the restaurant
//   * cash                 -> the RIDER collected at the door
// Only fulfilled orders count (status not in pending/cancelled/rejected),
// matching getOverview's revenue definition. Only paid orders move money in
// the rollup; refunds are surfaced separately.
async function getSettlement(req, res) {
  try {
    const range = parseDateRange(req.query);
    if (Number.isNaN(range.from.getTime()) || Number.isNaN(range.toExclusive.getTime())) {
      return res.status(400).json({ error: 'Invalid from/to date (use YYYY-MM-DD)' });
    }
    // Guard the paging loop: an unbounded range would pull the whole table
    // into memory. ~13 months covers any real settlement period.
    const spanDays = (range.toExclusive - range.from) / 86400000;
    if (spanDays > 400) {
      return res.status(400).json({ error: 'Date range too large — export at most 400 days at a time' });
    }

    const PAGE = 1000;
    const MAX_ROWS = 50000;
    const raw = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await foodRepository.settlementPage({
        from: range.from,
        toExclusive: range.toExclusive,
        limit: PAGE,
        offset,
      });
      raw.push(...page);
      if (!page.length || page.length < PAGE || raw.length >= MAX_ROWS) break;
    }

    const rows = raw.map((o) => {
      const subtotal = round2(Number(o.subtotal || 0));
      const markup = round2(Number(o.platform_margin_total || 0));
      return {
        orderCode: o.order_code,
        date: o.created_at,
        merchantId: o.merchants ? o.merchants.id : null,
        merchant: o.merchants ? o.merchants.name : null,
        subtotal,
        restaurantPayout: round2(subtotal - markup), // = sum of net prices
        platformMarkup: markup,
        deliveryFee: round2(Number(o.delivery_fee || 0)),
        // The delivery fee is split. driverFee is the rider's share; the
        // remainder is ours. Read off the row so a historical order reports
        // the deal it was actually placed on.
        driverFee: round2(Number(o.driver_fee || 0)),
        platformDeliveryShare: round2(Number(o.delivery_fee || 0) - Number(o.driver_fee || 0)),
        // VAT is collected on the platform's behalf and owed onward to the
        // tax authority — never part of the restaurant payout or our markup.
        vat: round2(Number(o.vat_amount || 0)),
        total: round2(Number(o.total || 0)),
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        collectedBy: o.payment_method === 'cash' ? 'cash_rider' : 'platform_online',
      };
    });

    // Per-merchant rollup. Only 'paid' orders have actually moved money.
    const byMerchantMap = new Map();
    const totals = {
      orders: 0,
      onlineOwedToRestaurant: 0, onlineMarkupKept: 0,
      cashCollectedByRider: 0, cashRestaurantPayout: 0, cashMarkup: 0,
      // VAT collected on paid orders — what we owe the tax authority for the
      // period, split the same way as the money it arrived with.
      vatCollected: 0, onlineVat: 0, cashVat: 0,
      // The delivery fee, split two ways and in two directions. On a PREPAID
      // order we hold the cash, so driverPayoutOwed is a payable — the one
      // number to look at before paying riders. On a CASH order the rider
      // already kept their share, so it is reported for completeness only
      // and is never owed by us.
      driverPayoutOwed: 0, driverKeptFromCash: 0, platformDeliveryShare: 0,
      refundedAmount: 0,
    };
    const blankBucket = (r) => ({
      merchantId: r.merchantId, merchant: r.merchant, orders: 0,
      onlineOwedToRestaurant: 0, onlineMarkupKept: 0,
      cashCollectedByRider: 0, cashRestaurantPayout: 0, cashMarkup: 0,
      vatCollected: 0,
      refundedAmount: 0,
    });
    for (const r of rows) {
      const key = r.merchantId || 'unknown';
      if (!byMerchantMap.has(key)) byMerchantMap.set(key, blankBucket(r));
      const m = byMerchantMap.get(key);
      m.orders += 1;
      totals.orders += 1;

      if (r.paymentStatus === 'refunded') {
        m.refundedAmount = round2(m.refundedAmount + r.total);
        totals.refundedAmount = round2(totals.refundedAmount + r.total);
        continue;
      }
      if (r.paymentStatus !== 'paid') continue; // awaiting/failed: not collected yet

      m.vatCollected = round2(m.vatCollected + r.vat);
      totals.vatCollected = round2(totals.vatCollected + r.vat);
      totals.platformDeliveryShare = round2(totals.platformDeliveryShare + r.platformDeliveryShare);

      if (r.collectedBy === 'platform_online') {
        m.onlineOwedToRestaurant = round2(m.onlineOwedToRestaurant + r.restaurantPayout);
        m.onlineMarkupKept = round2(m.onlineMarkupKept + r.platformMarkup);
        totals.onlineOwedToRestaurant = round2(totals.onlineOwedToRestaurant + r.restaurantPayout);
        totals.onlineMarkupKept = round2(totals.onlineMarkupKept + r.platformMarkup);
        totals.onlineVat = round2(totals.onlineVat + r.vat);
        totals.driverPayoutOwed = round2(totals.driverPayoutOwed + r.driverFee);
      } else {
        m.cashCollectedByRider = round2(m.cashCollectedByRider + r.total);
        m.cashRestaurantPayout = round2(m.cashRestaurantPayout + r.restaurantPayout);
        m.cashMarkup = round2(m.cashMarkup + r.platformMarkup);
        totals.cashCollectedByRider = round2(totals.cashCollectedByRider + r.total);
        totals.cashRestaurantPayout = round2(totals.cashRestaurantPayout + r.restaurantPayout);
        totals.cashMarkup = round2(totals.cashMarkup + r.platformMarkup);
        totals.cashVat = round2(totals.cashVat + r.vat);
        totals.driverKeptFromCash = round2(totals.driverKeptFromCash + r.driverFee);
      }
    }

    logAudit({
      actorId: req.adminId,
      action: 'admin_food_settlement_read',
      resourceType: 'orders',
      meta: { from: range.fromLabel, to: range.toLabel, orders: totals.orders },
    });

    return res.json({
      from: range.fromLabel,
      to: range.toLabel,
      rows,
      byMerchant: Array.from(byMerchantMap.values()).sort((a, b) =>
        (a.merchant || '').localeCompare(b.merchant || '')
      ),
      totals,
    });
  } catch (err) {
    console.error('food getSettlement error:', err);
    return res.status(500).json({ error: 'Could not build the settlement report' });
  }
}

module.exports = {
  getOverview,
  listRefunds,
  getSettlement,
  listMerchants,
  createMerchant,
  updateMerchant,
  deleteMerchant,
  suspendMerchant,
  reactivateMerchant,
  replenishCredit,
  getMerchantMenu,
  addCategoryForMerchant,
  updateAnyCategory,
  deleteAnyCategory,
  addItemForMerchant,
  moderateItem,
  removeItem,
  listOrders,
  acceptOrder,
  rejectOrder,
  advanceOrderStatus,
  verifyPayment,
  rejectPayment,
  getOrderPhotos,
  cancelOrder,
  refundPayment,
  assignDriver,
  createMerchantImageUploadUrl: createMerchantImageUploadUrlHandler,
  setMerchantOwner,
  setMerchantOwnerPassword,
};
