// ---------------------------------------------------------------------
// Store owner portal — catalogue, stock and business profile.
// Every query is scoped to the signed-in owner via merchants.owner_id, and
// the route layer has already asserted vertical = 'shop'.
//
// TWO RULES THIS FILE ENFORCES THAT THE FOOD EQUIVALENT ALSO DOES:
//
//   1. net_price NEVER appears here — not read, not written, not returned.
//      It is the store's own cut and is ADMIN-ONLY by design: an owner who
//      could set it would set it equal to price and zero our markup. The
//      route schemas reject the field, this file never selects it, and
//      migration 0030 revoked the direct-write grant that made the API
//      rule the only guard.
//
//   2. Stock counts ARE returned here, unlike on the customer API. The
//      owner is entitled to their own inventory; the confidentiality
//      concern (0029) is about competitors reading it with the public
//      anon key, not about the store seeing its own numbers.
// ---------------------------------------------------------------------
const shopManagementRepository = require('../repositories/shopManagementRepository');
const { config } = require('../lib/config');
const { round2 } = require('../lib/foodMoney');
const {
  buildMerchantLogoPath,
  buildMenuItemImagePath,
  createMerchantImageUploadUrl,
  merchantImagePublicUrl,
} = require('../lib/storage');
const { validateImageFile, validateMenuImageFile } = require('../lib/uploadValidation');
const { lowStockProducts } = require('../lib/stock');
const { logAudit } = require('../lib/audit');


function storeView(m) {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    vertical: m.vertical || 'shop',
    category: m.cuisine_type,
    description: m.description,
    logoUrl: m.logo_url,
    address: m.address,
    street: m.street,
    buildingNumber: m.building_number,
    lat: m.lat,
    lng: m.lng,
    isActive: m.is_active,
    status: m.status,
    creditLimit: Number(m.credit_limit),
    creditUsed: round2(Number(m.credit_used)),
    creditRemaining: round2(Math.max(0, Number(m.credit_limit) - Number(m.credit_used))),
    isFeatured: m.is_featured,
    badge: m.badge,
    createdAt: m.created_at,
  };
}

// The owner's own store row. requireMerchantVertical already loaded a thin
// version onto req.merchant; this re-reads the full column set.
async function loadOwnedStore(ownerId) {
  return shopManagementRepository.storeByOwner(ownerId);
}

async function requireOwnedStore(req, res) {
  const store = await loadOwnedStore(req.merchantOwnerId);
  if (!store) {
    res.status(404).json({ error: 'No store is linked to this account' });
    return null;
  }
  return store;
}

// Confirm a category belongs to the caller's store. Without this a store
// could attach its products to another store's category row — the FK only
// requires the category to exist, not to be theirs.
async function assertOwnedCategory(storeId, categoryId, res) {
  if (!categoryId) return true; // uncategorised is fine
  if (!(await shopManagementRepository.owned('product_categories', categoryId, storeId))) {
    res.status(400).json({ error: 'Category not found' });
    return false;
  }
  return true;
}

// Confirm a product belongs to the caller's store before any write.
// Returns 404 (not 403) for a foreign id so the endpoint never confirms
// that some other store's product exists.
async function assertOwnedProduct(storeId, productId, res) {
  if (!(await shopManagementRepository.owned('products', productId, storeId))) {
    res.status(404).json({ error: 'Product not found' });
    return false;
  }
  return true;
}

// --- Profile ----------------------------------------------------------
async function getProfile(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    return res.json({ store: storeView(store) });
  } catch (err) {
    console.error('shop merchant getProfile error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function updateProfile(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;

    // A store with no pin cannot take orders: the rider would have no
    // pickup point and checkout's radius check would be skipped entirely.
    const lat = req.body.lat ?? store.lat;
    const lng = req.body.lng ?? store.lng;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(422).json({
        error: 'Drop a pin on your store location before saving.',
        failure_reason: 'location_required',
      });
    }

    const data = await shopManagementRepository.updateStore({ id: store.id, ownerId: req.merchantOwnerId, fields: req.body });
    if (!data) return res.status(404).json({ error: 'Could not save your store profile' });
    logAudit({
      actorId: req.merchantOwnerId,
      action: 'merchant_shop_profile_updated',
      resourceType: 'merchant',
      resourceId: store.id,
      meta: { fields: Object.keys(req.body) },
    });
    return res.json({ store: storeView(data) });
  } catch (err) {
    console.error('shop merchant updateProfile error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Images (public merchant-images bucket, shared with food) ----------
async function createImageUploadUrl(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;

    const kind = req.body.kind === 'logo' ? 'logo' : 'item';
    // The validators destructure { fileName, mimeType } — passing
    // { name, type } left both undefined and 400'd every request.
    const check = kind === 'logo'
      ? validateImageFile({ fileName: req.body.file_name, mimeType: req.body.mime_type })
      : validateMenuImageFile({ fileName: req.body.file_name, mimeType: req.body.mime_type });
    if (!check.ok) return res.status(400).json({ error: check.error });

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
    console.error('shop merchant createImageUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

// --- Catalogue --------------------------------------------------------
async function getCatalogue(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;

    const { categories, products } = await shopManagementRepository.catalogue(store.id);

    return res.json({
      store: storeView(store),
      categories,
      products,
    });
  } catch (err) {
    console.error('shop merchant getCatalogue error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function addCategory(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    const data = await shopManagementRepository.insertCategory(store.id, req.body);
    return res.status(201).json({ category: data });
  } catch (err) {
    console.error('shop addCategory error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function updateCategory(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    const data = await shopManagementRepository.updateCategory(req.params.id, store.id, req.body);
    if (!data) return res.status(404).json({ error: 'Category not found' });
    return res.json({ category: data });
  } catch (err) {
    console.error('shop updateCategory error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function deleteCategory(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    await shopManagementRepository.deleteCategory(req.params.id, store.id);
    return res.json({ deleted: true });
  } catch (err) {
    console.error('shop deleteCategory error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function addProduct(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if (!(await assertOwnedCategory(store.id, req.body.category_id, res))) return undefined;
    const data = await shopManagementRepository.insertProduct(store.id, req.body);
    logAudit({
      actorId: req.merchantOwnerId,
      action: 'merchant_shop_product_added',
      resourceType: 'product',
      resourceId: data.id,
      meta: { name: data.name },
    });
    return res.status(201).json({ product: data });
  } catch (err) {
    console.error('shop addProduct error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function updateProduct(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if ('category_id' in req.body && !(await assertOwnedCategory(store.id, req.body.category_id, res))) return undefined;
    let data;
    try {
      data = await shopManagementRepository.updateProduct(req.params.id, store.id, req.body);
    } catch (error) {
      // 23514 = products_net_price_range. The store is trying to price BELOW
      // the net price an admin agreed with them. Explain the floor without
      // echoing net_price itself, which the store must never see.
      if (error.code === '23514') {
        return res.status(422).json({
          error: 'That price is below the agreed cost for this product. Contact Alabiq to change it.',
          failure_reason: 'price_below_agreed_cost',
        });
      }
      console.error('shop updateProduct error:', error);
      return res.status(500).json({ error: 'Could not update the product' });
    }
    if (!data) return res.status(404).json({ error: 'Product not found' });
    return res.json({ product: data });
  } catch (err) {
    console.error('shop updateProduct error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function deleteProduct(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    try {
      await shopManagementRepository.deleteProduct(req.params.id, store.id);
    } catch (error) {
      // order_items keeps product_id ON DELETE SET NULL, so history survives;
      // a failure here is a genuine constraint problem worth surfacing.
      return res.status(409).json({
        error: 'This product could not be deleted. Mark it unavailable instead.',
      });
    }
    return res.json({ deleted: true });
  } catch (err) {
    console.error('shop deleteProduct error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Variants ---------------------------------------------------------
async function addVariant(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if (!(await assertOwnedProduct(store.id, req.params.id, res))) return undefined;

    let data;
    try {
      data = await shopManagementRepository.insertVariant(req.params.id, req.body);
    } catch (error) {
      // 23505 = the per-product unique SKU index.
      if (error.code === '23505') {
        return res.status(409).json({ error: 'That SKU is already used by another option' });
      }
      console.error('shop addVariant error:', error);
      return res.status(500).json({ error: 'Could not add the option' });
    }
    return res.status(201).json({ variant: data });
  } catch (err) {
    console.error('shop addVariant error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function updateVariant(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if (!(await assertOwnedProduct(store.id, req.params.id, res))) return undefined;

    let data;
    try {
      data = await shopManagementRepository.updateVariant(req.params.variantId, req.params.id, req.body);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'That SKU is already used by another option' });
      }
      if (error.code === '23514') {
        return res.status(422).json({
          error: 'That option price is below the agreed cost. Contact Alabiq to change it.',
          failure_reason: 'price_below_agreed_cost',
        });
      }
      return res.status(500).json({ error: 'Could not update the option' });
    }
    if (!data) return res.status(404).json({ error: 'Option not found' });
    return res.json({ variant: data });
  } catch (err) {
    console.error('shop updateVariant error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function deleteVariant(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if (!(await assertOwnedProduct(store.id, req.params.id, res))) return undefined;

    try {
      await shopManagementRepository.deleteVariant(req.params.variantId, req.params.id);
    } catch (error) {
      return res.status(409).json({
        error: 'This option could not be deleted. Mark it unavailable instead.',
      });
    }
    return res.json({ deleted: true });
  } catch (err) {
    console.error('shop deleteVariant error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Stock ------------------------------------------------------------
// Setting stock is an ABSOLUTE write, not a delta. Deltas would race with
// the checkout RPC's decrement; an absolute value from a human restocking
// a shelf is the intent, and the last write wins by design.
async function setStock(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if (!(await assertOwnedProduct(store.id, req.params.id, res))) return undefined;

    const { variant_id, stock_quantity } = req.body;

    if (variant_id) {
      const data = await shopManagementRepository.setVariantStock(variant_id, req.params.id, stock_quantity);
      if (!data) return res.status(404).json({ error: 'Option not found' });
      logAudit({
        actorId: req.merchantOwnerId,
        action: 'merchant_shop_stock_set',
        resourceType: 'product_variant',
        resourceId: variant_id,
        meta: { stock_quantity },
      });
      return res.json({ variant: data });
    }

    const data = await shopManagementRepository.setProductStock(req.params.id, store.id, stock_quantity);
    if (!data) return res.status(404).json({ error: 'Product not found' });
    logAudit({
      actorId: req.merchantOwnerId,
      action: 'merchant_shop_stock_set',
      resourceType: 'product',
      resourceId: req.params.id,
      meta: { stock_quantity },
    });
    return res.json({ product: data });
  } catch (err) {
    console.error('shop setStock error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function getInventory(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    const low = await lowStockProducts(store.id);
    return res.json({
      lowStock: low,
      outOfStock: low.filter((p) => Number(p.stock_quantity) <= 0),
      threshold: config.shop.lowStockThreshold,
    });
  } catch (err) {
    console.error('shop getInventory error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Analytics --------------------------------------------------------
async function getAnalytics(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;

    const { orders: rows, counts } = await shopManagementRepository.analytics(store.id);
    const byStatus = {};
    for (const o of rows) byStatus[o.status] = Number(o.count);
    const totalOrders = rows.reduce((sum, row) => sum + Number(row.count), 0);
    const deliveredCount = rows.filter((o) => o.status === 'delivered').reduce((sum, o) => sum + Number(o.count), 0);
    const deliveredVolume = rows.reduce((sum, row) => sum + Number(row.delivered_total), 0);

    const low = await lowStockProducts(store.id);

    return res.json({
      totalOrders,
      byStatus,
      deliveredCount,
      // Gross customer spend on delivered orders. NOT the store's payout —
      // that is subtotal minus our markup, and the markup is never exposed
      // to the store.
      deliveredVolume: round2(deliveredVolume),
      productCount: counts.products,
      categoryCount: counts.categories,
      lowStockCount: low.length,
      credit: {
        limit: Number(store.credit_limit),
        used: round2(Number(store.credit_used)),
        remaining: round2(Math.max(0, Number(store.credit_limit) - Number(store.credit_used))),
        alertAt: round2(Number(store.credit_limit) * config.food.creditAlertPct),
        suspended: store.status === 'suspended',
      },
    });
  } catch (err) {
    console.error('shop getAnalytics error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  createImageUploadUrl,
  getCatalogue,
  addCategory,
  updateCategory,
  deleteCategory,
  addProduct,
  updateProduct,
  deleteProduct,
  addVariant,
  updateVariant,
  deleteVariant,
  setStock,
  getInventory,
  getAnalytics,
  requireOwnedStore,
  storeView,
};
