'use strict';

// ---------------------------------------------------------------------
// Admin — Ecommerce (shop) vertical data access.
// Single writer of products.net_price (the platform markup control).
// Every merchants query filters vertical = 'shop': the table is shared
// with Food Delivery.
// ---------------------------------------------------------------------
const database = require('../lib/database/pool');

const STORE_SELECT = `id,name,vertical,cuisine_type,description,logo_url,address,street,building_number,
  lat,lng,is_active,status,accepting_orders,credit_limit,credit_used,is_featured,badge,owner_id,created_at`;
const ADMIN_PRODUCT_SELECT = `id,merchant_id,category_id,name,description,brand,unit,weight_grams,barcode,
  price,net_price,image_url,stock_quantity,low_stock_threshold,track_stock,is_available,created_at`;
const ADMIN_VARIANT_SELECT = 'id,product_id,sku,label,price,net_price,stock_quantity,sort_order,is_available';
const ADMIN_CATEGORY_SELECT = 'id,name,sort_order,is_active';

// Whitelisted by the route schemas in routes/admin.js.
const STORE_FIELDS = ['name','cuisine_type','description','logo_url','address','street','building_number',
  'lat','lng','is_active','is_featured','badge','credit_limit'];
const PRODUCT_FIELDS = ['category_id','name','description','brand','unit','weight_grams','barcode','price',
  'net_price','image_url','stock_quantity','low_stock_threshold','track_stock','is_available'];
const VARIANT_FIELDS = ['sku','label','price','net_price','stock_quantity','sort_order','is_available'];
const CATEGORY_FIELDS = ['name','sort_order','is_active'];

async function loadStore(id) {
  const result = await database.query(
    `SELECT * FROM public.merchants WHERE id=$1 AND vertical='shop'`, [id],
  );
  return result.rows[0] || null;
}

async function overview() {
  const [orders, stores, awaitingPayments, refundsOwed, outOfStock] = await Promise.all([
    database.query(`SELECT id,status,total,platform_margin_total,payment_status,created_at
      FROM public.shop_orders ORDER BY created_at DESC LIMIT 2000`),
    database.query(`SELECT status,credit_used,credit_limit FROM public.merchants WHERE vertical='shop'`),
    database.query(`SELECT count(*)::int AS count FROM public.shop_orders WHERE payment_status='awaiting'`),
    database.query(`SELECT count(*)::int AS count FROM public.shop_orders
      WHERE status IN ('cancelled','rejected') AND payment_status='paid'`),
    database.query(`SELECT count(*)::int AS count FROM public.products WHERE track_stock=true AND stock_quantity<=0`),
  ]);
  return {
    orders: orders.rows,
    stores: stores.rows,
    awaitingPayments: awaitingPayments.rows[0].count,
    refundsOwed: refundsOwed.rows[0].count,
    outOfStock: outOfStock.rows[0].count,
  };
}

async function listStores({ limit = 100, offset = 0, search, sortBy, sortOrder, filters }) {
  const values = [];
  let where = `WHERE m.vertical = 'shop'`;
  
  // Handle filters object
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      values.push(value);
      where += ` AND m.${key} = $${values.length}`;
    });
  }
  
  // Handle search
  if (search) {
    values.push(`%${search}%`);
    where += ` AND (m.name ILIKE $${values.length} OR m.address ILIKE $${values.length})`;
  }
  
  // Validate sort column
  const allowedSortColumns = ['id', 'name', 'status', 'is_active', 'accepting_orders', 'credit_limit', 'credit_used', 'created_at'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  // Count query
  const countQuery = `SELECT count(*)::int AS total FROM public.merchants m ${where}`;
  const countResult = await database.query(countQuery, values.slice());
  const total = countResult.rows[0].total;
  
  values.push(limit, offset);
  const result = await database.query(
    `SELECT ${STORE_SELECT} FROM public.merchants m ${where} ORDER BY m.${safeSortBy} ${safeSortOrder} LIMIT $${values.length-1} OFFSET $${values.length}`,
    values,
  );
  return { rows: result.rows, total };
}

async function emailsByIds(ids) {
  if (!ids.length) return [];
  const result = await database.query('SELECT id,email FROM public.profiles WHERE id = ANY($1)', [ids]);
  return result.rows;
}

function pickFields(body, allowed) {
  const fields = {};
  for (const key of allowed) if (Object.hasOwn(body, key)) fields[key] = body[key];
  return fields;
}

async function insertStore(body) {
  const fields = pickFields(body, STORE_FIELDS);
  const names = Object.keys(fields);
  const result = await database.query(
    `INSERT INTO public.merchants (vertical,${names.join(',')})
     VALUES ('shop',${names.map((_, i) => `$${i + 1}`).join(',')}) RETURNING ${STORE_SELECT}`,
    names.map((key) => fields[key]),
  );
  return result.rows[0];
}

async function updateStore(id, body) {
  const fields = pickFields(body, STORE_FIELDS);
  const names = Object.keys(fields);
  if (!names.length) {
    const current = await loadStore(id);
    return current;
  }
  const result = await database.query(
    `UPDATE public.merchants SET ${names.map((key, i) => `${key}=$${i + 1}`).join(',')}
     WHERE id=$${names.length + 1} AND vertical='shop' RETURNING ${STORE_SELECT}`,
    [...names.map((key) => fields[key]), id],
  );
  return result.rows[0] || null;
}

async function deleteStore(id) {
  const result = await database.query(`DELETE FROM public.merchants WHERE id=$1`, [id]);
  return result.rowCount > 0;
}

async function setStoreStatus(id, status) {
  await database.query(`UPDATE public.merchants SET status=$2 WHERE id=$1`, [id, status]);
}

// Compare-and-swap so two admins reconciling at once cannot both apply.
async function replenishStoreCredit({ id, after, status, expectedCreditUsed }) {
  const result = await database.query(
    `UPDATE public.merchants SET credit_used=$2,status=$3
     WHERE id=$1 AND credit_used=$4 RETURNING id`,
    [id, after, status, expectedCreditUsed],
  );
  return result.rowCount > 0;
}

async function insertCreditLedger({ merchantId, type, amount, balanceAfter, note, createdBy, shopOrderId = null }) {
  await database.query(
    `INSERT INTO public.merchant_credit_ledger (merchant_id,type,amount,balance_after,note,created_by,shop_order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [merchantId, type, amount, balanceAfter, note, createdBy, shopOrderId],
  );
}

async function linkStoreOwner(storeId, ownerId) {
  await database.query(`UPDATE public.merchants SET owner_id=$2 WHERE id=$1`, [storeId, ownerId]);
}

async function catalogue(storeId, { page = 1, limit = 50, sortBy = 'name', sortOrder = 'asc', search = '', filters = {} } = {}) {
  const offset = (page - 1) * limit;
  const values = [storeId];
  let where = `WHERE p.merchant_id=$1`;

  // Handle filters object
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      values.push(value);
      where += ` AND p.${key} = $${values.length}`;
    });
  }

  // Handle search
  if (search) {
    values.push(`%${search}%`);
    where += ` AND (p.name ILIKE $${values.length} OR p.description ILIKE $${values.length} OR p.brand ILIKE $${values.length})`;
  }

  // Validate sort column
  const allowedSortColumns = ['name', 'price', 'net_price', 'stock_quantity', 'created_at', 'brand'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'name';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Count total
  const countResult = await database.query(
    `SELECT count(*)::int AS total FROM public.products p ${where}`,
    values,
  );
  const total = countResult.rows[0].total;

  // Fetch categories (all, not paginated - small dataset)
  const categoriesResult = await database.query(
    `SELECT ${ADMIN_CATEGORY_SELECT} FROM public.product_categories WHERE merchant_id=$1 ORDER BY sort_order`,
    [storeId],
  );

  // Fetch products page with variants
  values.push(limit, offset);
  const productsResult = await database.query(
    `SELECT ${ADMIN_PRODUCT_SELECT},COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',v.id,'product_id',v.product_id,'sku',v.sku,'label',v.label,'price',v.price,'net_price',v.net_price,
        'stock_quantity',v.stock_quantity,'sort_order',v.sort_order,'is_available',v.is_available)
        ORDER BY v.sort_order) FROM public.product_variants v WHERE v.product_id=p.id),'[]'::jsonb) AS product_variants
      FROM public.products p ${where} ORDER BY p.${safeSortBy} ${safeSortOrder} LIMIT $${values.length-1} OFFSET $${values.length}`,
    values,
  );

  return {
    data: {
      categories: categoriesResult.rows,
      products: productsResult.rows,
    },
    pagination: {
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      page,
      limit,
    },
  };
}

async function insertCategory(storeId, body) {
  const fields = pickFields(body, CATEGORY_FIELDS);
  const names = Object.keys(fields);
  const result = await database.query(
    `INSERT INTO public.product_categories (merchant_id,${names.join(',')})
     VALUES ($1,${names.map((_, i) => `$${i + 2}`).join(',')}) RETURNING ${ADMIN_CATEGORY_SELECT}`,
    [storeId, ...names.map((key) => fields[key])],
  );
  return result.rows[0];
}

async function updateCategory(id, body) {
  const fields = pickFields(body, CATEGORY_FIELDS);
  const names = Object.keys(fields);
  if (!names.length) return null;
  const result = await database.query(
    `UPDATE public.product_categories SET ${names.map((key, i) => `${key}=$${i + 1}`).join(',')}
     WHERE id=$${names.length + 1} RETURNING ${ADMIN_CATEGORY_SELECT}`,
    [...names.map((key) => fields[key]), id],
  );
  return result.rows[0] || null;
}

async function deleteCategory(id) {
  const result = await database.query(`DELETE FROM public.product_categories WHERE id=$1`, [id]);
  return result.rowCount > 0;
}

async function insertProduct(storeId, body) {
  const fields = pickFields(body, PRODUCT_FIELDS);
  const names = Object.keys(fields);
  const result = await database.query(
    `INSERT INTO public.products (merchant_id,${names.join(',')})
     VALUES ($1,${names.map((_, i) => `$${i + 2}`).join(',')}) RETURNING ${ADMIN_PRODUCT_SELECT}`,
    [storeId, ...names.map((key) => fields[key])],
  );
  return result.rows[0];
}

async function updateProduct(id, body) {
  const fields = pickFields(body, PRODUCT_FIELDS);
  const names = Object.keys(fields);
  if (!names.length) return null;
  const result = await database.query(
    `UPDATE public.products SET ${names.map((key, i) => `${key}=$${i + 1}`).join(',')}
     WHERE id=$${names.length + 1} RETURNING ${ADMIN_PRODUCT_SELECT}`,
    [...names.map((key) => fields[key]), id],
  );
  return result.rows[0] || null;
}

async function deleteProduct(id) {
  const result = await database.query(`DELETE FROM public.products WHERE id=$1`, [id]);
  return result.rowCount > 0;
}

async function updateVariant(variantId, productId, body) {
  const fields = pickFields(body, VARIANT_FIELDS);
  const names = Object.keys(fields);
  if (!names.length) return null;
  const result = await database.query(
    `UPDATE public.product_variants SET ${names.map((key, i) => `${key}=$${i + 1}`).join(',')}
     WHERE id=$${names.length + 1} AND product_id=$${names.length + 2} RETURNING ${ADMIN_VARIANT_SELECT}`,
    [...names.map((key) => fields[key]), variantId, productId],
  );
  return result.rows[0] || null;
}

async function insertVariant(productId, body) {
  const fields = pickFields(body, VARIANT_FIELDS);
  const names = Object.keys(fields);
  const result = await database.query(
    `INSERT INTO public.product_variants (product_id,${names.join(',')})
     VALUES ($1,${names.map((_, i) => `$${i + 2}`).join(',')}) RETURNING ${ADMIN_VARIANT_SELECT}`,
    [productId, ...names.map((key) => fields[key])],
  );
  return result.rows[0];
}

async function deleteVariant(variantId, productId) {
  const result = await database.query(
    `DELETE FROM public.product_variants WHERE id=$1 AND product_id=$2`, [variantId, productId],
  );
  return result.rowCount > 0;
}

const ORDER_SELECT = `o.id,o.order_code,o.status,o.subtotal,o.delivery_fee,o.platform_margin_total,o.vat_amount,o.vat_rate,
  o.total,o.distance_km,o.delivery_address,o.delivery_street,o.delivery_building,o.contact_phone,
  o.payment_status,o.payment_method,o.gateway_transaction_id,o.reject_reason,
  o.stock_reserved_at,o.stock_released_at,o.created_at,o.accepted_at,o.packed_at,o.ready_at,o.delivered_at,
  m.id AS merchant_id,m.name AS merchant_name,
  c.full_name AS customer_full_name,c.mobile_number AS customer_mobile_number,
  d.order_id AS delivery_row_id,d.status AS delivery_status,d.driver_id AS delivery_driver_id,
  d.pickup_photo_path,d.delivery_photo_path,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name_snapshot',i.name_snapshot,
      'variant_label_snapshot',i.variant_label_snapshot,'sku_snapshot',i.sku_snapshot,
      'unit_price',i.unit_price,'quantity',i.quantity,'line_total',i.line_total,'margin_total',i.margin_total)
      ORDER BY i.created_at) FROM public.shop_order_items i WHERE i.order_id=o.id),'[]'::jsonb) AS order_items`;

function nestOrder(row) {
  const {
    merchant_id, merchant_name,
    customer_full_name, customer_mobile_number,
    delivery_row_id, delivery_status, delivery_driver_id, pickup_photo_path, delivery_photo_path,
    order_items,
    ...order
  } = row;
  return {
    ...order,
    merchants: merchant_id ? { id: merchant_id, name: merchant_name } : null,
    profiles: (customer_full_name != null || customer_mobile_number != null)
      ? { full_name: customer_full_name, mobile_number: customer_mobile_number }
      : null,
    shop_deliveries: delivery_row_id
      ? {
          status: delivery_status,
          driver_id: delivery_driver_id,
          pickup_photo_path,
          delivery_photo_path,
        }
      : null,
    shop_order_items: order_items,
  };
}

async function listOrders({ status, merchantId, limit = 100, offset = 0, search, sortBy, sortOrder, filters }) {
  const values = [];
  let where = '';
  if (status) { values.push(status); where += ` AND o.status=$${values.length}`; }
  if (merchantId) { values.push(merchantId); where += ` AND o.merchant_id=$${values.length}`; }
  
  // Handle filters object
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      if (['status', 'merchantId'].includes(key)) return; // Already handled
      values.push(value);
      where += ` AND o.${key}=$${values.length}`;
    });
  }
  
  // Handle search
  if (search) {
    values.push(`%${search}%`);
    where += ` AND (o.order_code ILIKE $${values.length} OR o.delivery_address ILIKE $${values.length} OR (o.profiles && o.profiles->>'full_name' ILIKE $${values.length}))`;
  }
  
  // Validate sort column
  const allowedSortColumns = ['order_code', 'status', 'payment_status', 'payment_method', 'subtotal', 'delivery_fee', 'platform_margin_total', 'vat_amount', 'total', 'created_at'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  // Count query
  const countQuery = `SELECT count(*)::int AS total FROM public.shop_orders o
    LEFT JOIN public.merchants m ON m.id=o.merchant_id
    LEFT JOIN public.profiles c ON c.id=o.customer_id
    WHERE true${where}`;
  const countResult = await database.query(countQuery, values.slice());
  const total = countResult.rows[0].total;
  
  values.push(limit, offset);
  const result = await database.query(
    `SELECT ${ORDER_SELECT} FROM public.shop_orders o
       LEFT JOIN public.merchants m ON m.id=o.merchant_id
       LEFT JOIN public.profiles c ON c.id=o.customer_id
       LEFT JOIN public.shop_deliveries d ON d.order_id=o.id
     WHERE true${where} ORDER BY o.${safeSortBy} ${safeSortOrder} LIMIT $${values.length-1} OFFSET $${values.length}`,
    values,
  );
  return { rows: result.rows.map(nestOrder), total };
}


async function listRefunds({ page = 1, limit = 25, sortBy = 'cancelled_at', sortOrder = 'desc', search = '', filters = {} } = {}) {
  const offset = (page - 1) * limit;
  const values = [];
  let where = `WHERE o.status IN ('cancelled','rejected') AND o.payment_status='paid'`;

  // Handle filters object
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      values.push(value);
      where += ` AND o.${key} = $${values.length}`;
    });
  }

  // Handle search
  if (search) {
    values.push(`%${search}%`);
    where += ` AND (o.order_code ILIKE $${values.length} OR m.name ILIKE $${values.length})`;
  }

  // Validate sort column
  const allowedSortColumns = ['order_code', 'status', 'payment_status', 'payment_method', 'total', 'cancelled_at', 'created_at'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'cancelled_at';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Count query
  const countQuery = `SELECT count(*)::int AS total FROM public.shop_orders o LEFT JOIN public.merchants m ON m.id=o.merchant_id ${where}`;
  const countResult = await database.query(countQuery, values.slice());
  const total = countResult.rows[0].total;

  values.push(limit, offset);
  const result = await database.query(
    `SELECT o.order_code,o.status,o.payment_status,o.payment_method,o.total,o.reject_reason,
            o.cancelled_by,o.cancelled_at,o.created_at,m.name AS merchant_name
       FROM public.shop_orders o LEFT JOIN public.merchants m ON m.id=o.merchant_id
      ${where} ORDER BY o.${safeSortBy} ${safeSortOrder} LIMIT $${values.length-1} OFFSET $${values.length}`,
    values,
  );
  return {
    data: result.rows.map((o) => ({
      order_code: o.order_code,
      status: o.status,
      payment_status: o.payment_status,
      payment_method: o.payment_method,
      total: o.total,
      reject_reason: o.reject_reason,
      cancelled_by: o.cancelled_by,
      cancelled_at: o.cancelled_at,
      created_at: o.created_at,
      merchants: o.merchant_name ? { name: o.merchant_name } : null,
    })),
    pagination: {
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      page,
      limit,
    },
  };
}
async function loadOrderRow(code) {
  const result = await database.query(
    `SELECT id,order_code,customer_id,merchant_id,status,total,payment_status,payment_method
       FROM public.shop_orders WHERE order_code=$1`, [code],
  );
  return result.rows[0] || null;
}

async function latestAwaitingPaymentId(orderId) {
  const result = await database.query(
    `SELECT id FROM public.shop_order_payments WHERE order_id=$1 AND status='awaiting'
     ORDER BY created_at DESC LIMIT 1`, [orderId],
  );
  return result.rows[0] ? result.rows[0].id : null;
}

async function markPaymentPaid(id) {
  await database.query(`UPDATE public.shop_order_payments SET status='paid' WHERE id=$1`, [id]);
}

async function setOrderPaymentStatus(orderId, status) {
  await database.query(`UPDATE public.shop_orders SET payment_status=$2 WHERE id=$1`, [orderId, status]);
}

async function failAwaitingPayments(orderId) {
  await database.query(
    `UPDATE public.shop_order_payments SET status='failed' WHERE order_id=$1 AND status='awaiting'`, [orderId],
  );
}

async function refundPaidPayments(orderId) {
  await database.query(
    `UPDATE public.shop_order_payments SET status='refunded' WHERE order_id=$1 AND status='paid'`, [orderId],
  );
}

async function driverById(id) {
  const result = await database.query(
    `SELECT id,role,driver_approved,full_name FROM public.profiles WHERE id=$1`, [id],
  );
  return result.rows[0] || null;
}

async function upsertDelivery({ orderId, driverId, status }) {
  await database.query(
    `INSERT INTO public.shop_deliveries (order_id,driver_id,status) VALUES ($1,$2,$3)
     ON CONFLICT (order_id) DO UPDATE SET driver_id=$2,status=$3`, [orderId, driverId, status],
  );
}

async function deliveryPhotos(orderId) {
  const result = await database.query(
    `SELECT pickup_photo_path,delivery_photo_path FROM public.shop_deliveries WHERE order_id=$1`, [orderId],
  );
  return result.rows[0] || null;
}

async function settlementPage({ from, to, limit, offset }) {
  const result = await database.query(
    `SELECT o.order_code,o.created_at,o.subtotal,o.delivery_fee,o.driver_fee,o.platform_margin_total,
            o.vat_amount,o.total,o.payment_method,o.payment_status,m.name AS merchant_name
       FROM public.shop_orders o LEFT JOIN public.merchants m ON m.id=o.merchant_id
      WHERE o.created_at>=$1 AND o.created_at<=$2
      ORDER BY o.created_at DESC LIMIT $3 OFFSET $4`,
    [from.toISOString(), to.toISOString(), limit, offset],
  );
  return result.rows.map((o) => ({ ...o, merchants: o.merchant_name ? { name: o.merchant_name } : null }));
}

async function getInventory({ page = 1, limit = 50, sortBy = 'stock_quantity', sortOrder = 'asc', search = '', filters = {} } = {}) {
  const offset = (page - 1) * limit;
  const values = [];
  let where = `WHERE p.track_stock=true`;

  // Handle filters object
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      if (key === 'merchantId') {
        values.push(value);
        where += ` AND p.merchant_id = $${values.length}`;
        return;
      }
      if (key === 'lowStockOnly') {
        if (value === true || value === 'true') {
          where += ` AND p.stock_quantity <= p.low_stock_threshold`;
        }
        return;
      }
      values.push(value);
      where += ` AND p.${key} = $${values.length}`;
    });
  }

  // Handle search
  if (search) {
    values.push(`%${search}%`);
    where += ` AND (p.name ILIKE $${values.length} OR p.brand ILIKE $${values.length} OR p.barcode ILIKE $${values.length})`;
  }

  // Validate sort column
  const allowedSortColumns = ['name', 'brand', 'stock_quantity', 'low_stock_threshold', 'created_at', 'price', 'net_price'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'stock_quantity';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Count total
  const countResult = await database.query(
    `SELECT count(*)::int AS total FROM public.products p ${where}`,
    values,
  );
  const total = countResult.rows[0].total;

  // Fetch page
  values.push(limit, offset);
  const result = await database.query(
    `SELECT p.id,p.merchant_id,p.name,p.brand,p.unit,p.stock_quantity,p.low_stock_threshold,p.track_stock,p.is_available,p.price,p.net_price,
            m.name AS merchant_name
       FROM public.products p LEFT JOIN public.merchants m ON m.id=p.merchant_id
      ${where} ORDER BY p.${safeSortBy} ${safeSortOrder} LIMIT $${values.length-1} OFFSET $${values.length}`,
    values,
  );

  return {
    data: result.rows.map((p) => ({
      id: p.id,
      merchantId: p.merchant_id,
      name: p.name,
      brand: p.brand,
      unit: p.unit,
      stockQuantity: p.stock_quantity,
      lowStockThreshold: p.low_stock_threshold,
      trackStock: p.track_stock,
      isAvailable: p.is_available,
      price: p.price,
      netPrice: p.net_price,
      merchantName: p.merchant_name,
      isLowStock: p.stock_quantity <= p.low_stock_threshold,
    })),
    pagination: {
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      page,
      limit,
    },
  };
}

module.exports = {
  loadStore, overview, listStores, emailsByIds,
  insertStore, updateStore, deleteStore, setStoreStatus,
  replenishStoreCredit, insertCreditLedger, linkStoreOwner,
  catalogue, insertCategory, updateCategory, deleteCategory,
  insertProduct, updateProduct, deleteProduct,
  insertVariant, updateVariant, deleteVariant,
  listOrders, listRefunds, loadOrderRow,
  latestAwaitingPaymentId, markPaymentPaid,
  setOrderPaymentStatus, failAwaitingPayments, refundPaidPayments,
  driverById, upsertDelivery, deliveryPhotos, settlementPage,
  getInventory,
};
