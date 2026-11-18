// ---------------------------------------------------------------------
// Business Owner portal controller.
// Every query is scoped to the signed-in owner via merchants.owner_id.
// ---------------------------------------------------------------------
const { round2 } = require('../lib/foodMoney');
const merchantRepository = require('../repositories/merchantRepository');
const { config } = require('../lib/config');
const {
  buildMerchantLogoPath,
  buildMenuItemImagePath,
  createMerchantMediaUploadUrl,
  getMerchantMediaPublicUrl,
} = require('../lib/storage');
const { validateImageFile, validateMenuImageFile } = require('../lib/uploadValidation');
const { normalizeSizeOptions } = require('../lib/foodSizes');

async function loadOwnedMerchant(ownerId) {
  return merchantRepository.loadOwned(ownerId);
}

function merchantView(m) {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    // 'food' | 'shop' (migration 0026). The portal renders a restaurant or a
    // store dashboard off this; owner_id is UNIQUE so it is never ambiguous.
    vertical: m.vertical || 'food',
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
    creditLimit: Number(m.credit_limit),
    creditUsed: round2(Number(m.credit_used)),
    isFeatured: m.is_featured,
    badge: m.badge,
    createdAt: m.created_at,
  };
}

async function requireOwnedMerchant(req, res) {
  const merchant = await loadOwnedMerchant(req.merchantOwnerId);
  if (!merchant) {
    res.status(404).json({ error: 'No business profile is linked to this account' });
    return null;
  }
  return merchant;
}

async function getProfile(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;
    return res.json({ merchant: merchantView(merchant) });
  } catch (err) {
    console.error('merchant getProfile error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function updateProfile(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    // Location is mandatory: drivers navigate to this pin and the 15 km
    // delivery radius depends on it. The route rejects an explicit null, but
    // guard here too so a legacy unpinned merchant must set one to save.
    if (!Number.isFinite(req.body.lat) || !Number.isFinite(req.body.lng)) {
      return res.status(400).json({
        error: 'Set your restaurant location before saving',
        failure_reason: 'restaurant_location_required',
      });
    }

    const data = await merchantRepository.updateProfile({
      id: merchant.id, ownerId: req.merchantOwnerId, fields: {
        name: req.body.name,
        cuisine_type: req.body.cuisine_type ?? null,
        description: req.body.description ?? null,
        logo_url: req.body.logo_url ?? null,
        address: req.body.address ?? null,
        street: req.body.street ?? null,
        building_number: req.body.building_number ?? null,
        lat: req.body.lat,
        lng: req.body.lng,
      },
    });
    if (!data) return res.status(404).json({ error: 'Business profile not found' });
    return res.json({ merchant: merchantView(data) });
  } catch (err) {
    console.error('merchant updateProfile error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function createLogoUploadUrl(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    const { file_name, mime_type } = req.body || {};
    const fileCheck = validateImageFile({ fileName: file_name, mimeType: mime_type });
    if (!fileCheck.ok) {
      return res.status(400).json({ error: fileCheck.error });
    }

    const path = buildMerchantLogoPath(merchant.id, file_name);
    const { token, signedUrl } = await createMerchantMediaUploadUrl(path);
    const publicUrl = getMerchantMediaPublicUrl(path);

    return res.status(201).json({
      bucket: config.merchantImages.bucket,
      path,
      token,
      signedUrl,
      publicUrl,
      maxBytes: config.merchantImages.maxBytes,
    });
  } catch (err) {
    console.error('merchant createLogoUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

async function confirmLogoUpload(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    const path = req.body?.path;
    if (!path || !String(path).startsWith(`${merchant.id}/`)) {
      return res.status(400).json({ error: 'Invalid logo path' });
    }
    if (req.body.size_bytes != null && Number(req.body.size_bytes) > config.merchantImages.maxBytes) {
      return res.status(400).json({ error: `File exceeds max size of ${config.merchantImages.maxBytes} bytes` });
    }

    const logo_url = getMerchantMediaPublicUrl(path);
    const data = await merchantRepository.updateProfile({
      id: merchant.id, ownerId: req.merchantOwnerId,
      fields: { ...merchant, logo_url },
    });
    if (!data) return res.status(404).json({ error: 'Business profile not found' });
    return res.json({ merchant: merchantView(data), logoUrl: logo_url });
  } catch (err) {
    console.error('merchant confirmLogoUpload error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function createMenuItemImageUploadUrl(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    const { file_name, mime_type } = req.body || {};
    const fileCheck = validateMenuImageFile({ fileName: file_name, mimeType: mime_type });
    if (!fileCheck.ok) {
      return res.status(400).json({ error: fileCheck.error });
    }

    const path = buildMenuItemImagePath(merchant.id, file_name);
    const { token, signedUrl } = await createMerchantMediaUploadUrl(path);
    const publicUrl = getMerchantMediaPublicUrl(path);

    return res.status(201).json({
      bucket: config.merchantImages.bucket,
      path,
      token,
      signedUrl,
      publicUrl,
      maxBytes: config.merchantImages.maxBytes,
    });
  } catch (err) {
    console.error('merchant createMenuItemImageUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

async function confirmMenuItemImageUpload(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    const path = req.body?.path;
    const prefix = `${merchant.id}/menu-items/`;
    if (!path || !String(path).startsWith(prefix)) {
      return res.status(400).json({ error: 'Invalid image path' });
    }
    if (req.body.size_bytes != null && Number(req.body.size_bytes) > config.merchantImages.maxBytes) {
      return res.status(400).json({ error: `File exceeds max size of ${config.merchantImages.maxBytes} bytes` });
    }

    return res.json({ imageUrl: getMerchantMediaPublicUrl(path) });
  } catch (err) {
    console.error('merchant confirmMenuItemImageUpload error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function getMenu(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    const { categories, items } = await merchantRepository.menuForMerchant(merchant.id);
    return res.json({ merchant: merchantView(merchant), categories, items });
  } catch (err) {
    console.error('merchant getMenu error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function addCategory(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    const data = await merchantRepository.insertCategory(merchant.id, req.body);
    return res.status(201).json({ category: data });
  } catch (err) {
    console.error('merchant addCategory error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function updateCategory(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    const data = await merchantRepository.updateCategory(req.params.id, merchant.id, req.body);
    if (!data) return res.status(404).json({ error: 'Category not found' });
    return res.json({ category: data });
  } catch (err) {
    console.error('merchant updateCategory error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function deleteCategory(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    await merchantRepository.deleteCategory(req.params.id, merchant.id);
    return res.json({ deleted: true });
  } catch (err) {
    console.error('merchant deleteCategory error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function assertCategoryOwned(categoryId, merchantId) {
  if (!categoryId) return true;
  return merchantRepository.categoryOwned(categoryId, merchantId);
}

async function addItem(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;
    if (!(await assertCategoryOwned(req.body.category_id, merchant.id))) {
      return res.status(400).json({ error: 'category_id does not belong to this business' });
    }
    if ('size_options' in req.body) {
      const sized = normalizeSizeOptions(req.body.size_options);
      if (!sized.ok) return res.status(400).json({ error: sized.error });
      req.body.size_options = sized.value;
    }

    const data = await merchantRepository.insertMenuItem(merchant.id, req.body);
    return res.status(201).json({ item: data });
  } catch (err) {
    console.error('merchant addItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function updateItem(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;
    if (!(await assertCategoryOwned(req.body.category_id, merchant.id))) {
      return res.status(400).json({ error: 'category_id does not belong to this business' });
    }
    if ('size_options' in req.body) {
      const sized = normalizeSizeOptions(req.body.size_options);
      if (!sized.ok) return res.status(400).json({ error: sized.error });
      req.body.size_options = sized.value;
    }

    const data = await merchantRepository.updateMenuItem(req.params.id, merchant.id, req.body);
    if (!data) return res.status(404).json({ error: 'Menu item not found' });
    return res.json({ item: data });
  } catch (err) {
    console.error('merchant updateItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function getAnalytics(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    const { orderStats: rows, menuItemCount } = await merchantRepository.analytics(merchant.id);
    const statusCounts = {};
    for (const o of rows) {
      statusCounts[o.status] = Number(o.count);
    }
    const totalOrders = rows.reduce((sum, row) => sum + Number(row.count), 0);
    const completedOrders = rows.filter((row) => row.status === 'delivered')
      .reduce((sum, row) => sum + Number(row.count), 0);
    const activeOrders = rows.filter((row) =>
      ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'].includes(row.status))
      .reduce((sum, row) => sum + Number(row.count), 0);
    const todayOrders = rows.reduce((sum, row) => sum + Number(row.today_count), 0);
    const orderVolume = rows.reduce((sum, row) => sum + Number(row.delivered_total), 0);

    return res.json({
      merchant: merchantView(merchant),
      menuItems: menuItemCount,
      summary: {
        totalOrders,
        activeOrders,
        deliveredOrders: completedOrders,
        pendingOrders: statusCounts.pending || 0,
        todayOrders,
        orderVolume: round2(orderVolume),
        creditUsed: round2(Number(merchant.credit_used)),
        creditLimit: Number(merchant.credit_limit),
        creditRemaining: round2(Math.max(0, Number(merchant.credit_limit) - Number(merchant.credit_used))),
      },
      statusBreakdown: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    });
  } catch (err) {
    console.error('merchant getAnalytics error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function deleteItem(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    await merchantRepository.deleteMenuItem(req.params.id, merchant.id);
    return res.json({ deleted: true });
  } catch (err) {
    console.error('merchant deleteItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = {
  requireOwnedMerchant,
  getProfile,
  updateProfile,
  createLogoUploadUrl,
  confirmLogoUpload,
  createMenuItemImageUploadUrl,
  confirmMenuItemImageUpload,
  getAnalytics,
  getMenu,
  addCategory,
  updateCategory,
  deleteCategory,
  addItem,
  updateItem,
  deleteItem,
};
