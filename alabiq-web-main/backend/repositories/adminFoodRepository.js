'use strict';

// ---------------------------------------------------------------------
// Admin — Food Delivery vertical data access.
// merchants is shared with the Ecommerce vertical (vertical = 'food' here).
// ---------------------------------------------------------------------
const database = require('../lib/database/pool');

const MERCHANT_SELECT = `id,name,cuisine_type,description,logo_url,address,street,building_number,lat,lng,
  is_active,status,accepting_orders,credit_limit,credit_used,is_featured,badge,owner_id,created_at`;
const ADMIN_ITEM_SELECT = `id,category_id,name,description,price,net_price,item_type,image_url,is_available,size_options`;
const MODERATE_ITEM_SELECT = 'id,name,price,net_price,is_available,size_options';
const ADMIN_CATEGORY_SELECT = 'id,name,sort_order,is_active';

// Whitelisted by the route schemas in routes/admin.js.
const MERCHANT_FIELDS = ['name','cuisine_type','description','logo_url','address','street','building_number',
  'lat','lng','is_active','is_featured','badge'];
const ITEM_FIELDS = ['category_id','name','description','price','net_price','item_type','image_url',
  'is_available','size_options'];
const CATEGORY_FIELDS = ['name','sort_order','is_active'];

// jsonb columns: node-pg serializes JS arrays as Postgres array literals,
// which are NOT valid JSON — stringify them explicitly.
function encodeField(column, value) {
  return column === 'size_options' && value != null ? JSON.stringify(value) : value;
}

function pickFields(body, allowed) {
  const fields = {};
  for (const key of allowed) if (Object.hasOwn(body, key)) fields[key] = body[key];
  return fields;
}

async function loadMerchant(id) {
  const result = await database.query(
    `SELECT * FROM public.merchants WHERE id=$1 AND vertical='food'`, [id],
  );
  return result.rows[0] || null;
}

async function overview({ todayStart }) {
  const [orders, todayOrders, merchants, pendingPayments, refundsOwed] = await Promise.all([
    database.query(`SELECT status,platform_margin_total,total FROM public.orders`),
    database.query(`SELECT count(*)::int AS count FROM public.orders WHERE created_at>=$1`, [todayStart]),
    database.query(`SELECT status,credit_used,credit_limit FROM public.merchants WHERE vertical='food'`),
    database.query(`SELECT count(*)::int AS count FROM public.orders WHERE payment_status='awaiting'`),
    database.query(`SELECT count(*)::int AS count FROM public.orders
      WHERE status IN ('cancelled','rejected') AND payment_status='paid'`),
  ]);
  return {
    orders: orders.rows,
    totalOrders: orders.rowCount,
    todayOrders: todayOrders.rows[0].count,
    merchants: merchants.rows,
    pendingPayments: pendingPayments.rows[0].count,
    refundsOwed: refundsOwed.rows[0].count,
  };
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
  const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

  // Count total
  const countResult = await database.query(
    `SELECT count(*)::int AS total FROM public.orders o LEFT JOIN public.merchants m ON m.id=o.merchant_id ${where}`,
    values,
  );
  const total = countResult.rows[0].total;

  // Fetch page
  values.push(limit, offset);
  const result = await database.query(
    `SELECT o.order_code,o.status,o.payment_status,o.payment_method,o.total,o.reject_reason,
            o.cancelled_by,o.cancelled_at,o.created_at,m.name AS merchant_name
       FROM public.orders o LEFT JOIN public.merchants m ON m.id=o.merchant_id
      ${where}
      ORDER BY o.${safeSortBy} ${safeSortOrder} LIMIT $${values.length - 1} OFFSET $${values.length}`,
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

async function listMerchants({ limit = 100, offset = 0, search, sortBy, sortOrder, filters }) {
  const values = [];
  let where = `WHERE m.vertical = 'food'`;
  
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
    where += ` AND (m.name ILIKE $${values.length} OR m.address ILIKE $${values.length} OR m.cuisine_type ILIKE $${values.length})`;
  }
  
  // Validate sort column
  const allowedSortColumns = ['id', 'name', 'cuisine_type', 'status', 'is_active', 'accepting_orders', 'credit_limit', 'credit_used', 'created_at'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  // Count query
  const countQuery = `SELECT count(*)::int AS total FROM public.merchants m ${where}`;
  const countResult = await database.query(countQuery, values.slice());
  const total = countResult.rows[0].total;
  
  values.push(limit, offset);
  const result = await database.query(
    `SELECT ${MERCHANT_SELECT} FROM public.merchants m ${where} ORDER BY m.${safeSortBy} ${safeSortOrder} LIMIT $${values.length-1} OFFSET $${values.length}`,
    values,
  );
  return { rows: result.rows, total };
}

async function emailsByIds(ids) {
  if (!ids.length) return [];
  const result = await database.query('SELECT id,email FROM public.profiles WHERE id = ANY($1)', [ids]);
  return result.rows;
}

async function insertMerchant(body) {
  const fields = pickFields(body, MERCHANT_FIELDS);
  const names = Object.keys(fields);
  const result = await database.query(
    `INSERT INTO public.merchants (vertical,${names.join(',')})
     VALUES ('food',${names.map((_, i) => `$${i + 1}`).join(',')}) RETURNING ${MERCHANT_SELECT}`,
    names.map((key) => fields[key]),
  );
  return result.rows[0];
}

async function updateMerchant(id, body) {
  const fields = pickFields(body, MERCHANT_FIELDS);
  const names = Object.keys(fields);
  if (!names.length) return loadMerchant(id);
  const result = await database.query(
    `UPDATE public.merchants SET ${names.map((key, i) => `${key}=$${i + 1}`).join(',')}
     WHERE id=$${names.length + 1} AND vertical='food' RETURNING ${MERCHANT_SELECT}`,
    [...names.map((key) => fields[key]), id],
  );
  return result.rows[0] || null;
}

async function liveOrderCount(merchantId) {
  const result = await database.query(
    `SELECT count(*)::int AS count FROM public.orders
     WHERE merchant_id=$1 AND status IN ('pending','accepted','preparing','ready','out_for_delivery')`,
    [merchantId],
  );
  return result.rows[0].count;
}

async function deleteMerchant(id) {
  const result = await database.query(`DELETE FROM public.merchants WHERE id=$1`, [id]);
  return result.rowCount > 0;
}

async function setMerchantStatus(id, status) {
  await database.query(`UPDATE public.merchants SET status=$2 WHERE id=$1`, [id, status]);
}

// Compare-and-swap so two admins reconciling at once cannot both apply.
async function replenishMerchantCredit({ id, newUsed, newStatus, expectedCreditUsed }) {
  const result = await database.query(
    `UPDATE public.merchants SET credit_used=$2,status=$3
     WHERE id=$1 AND credit_used=$4 RETURNING id`,
    [id, newUsed, newStatus, expectedCreditUsed],
  );
  return result.rowCount > 0;
}

async function insertCreditLedger({ merchantId, type, amount, balanceAfter, note, createdBy }) {
  await database.query(
    `INSERT INTO public.merchant_credit_ledger (merchant_id,type,amount,balance_after,note,created_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [merchantId, type, amount, balanceAfter, note, createdBy],
  );
}

async function linkMerchantOwner(merchantId, ownerId) {
  const result = await database.query(
    `UPDATE public.merchants SET owner_id=$2 WHERE id=$1 RETURNING id`, [merchantId, ownerId],
  );
  return result.rowCount > 0;
}

async function menuForMerchant(merchantId) {
  const [categories, items] = await Promise.all([
    database.query(`SELECT ${ADMIN_CATEGORY_SELECT} FROM public.menu_categories
      WHERE merchant_id=$1 ORDER BY sort_order`, [merchantId]),
    database.query(`SELECT ${ADMIN_ITEM_SELECT} FROM public.menu_items
      WHERE merchant_id=$1 ORDER BY name`, [merchantId]),
  ]);
  return { categories: categories.rows, items: items.rows };
}

async function insertCategory(merchantId, body) {
  const fields = pickFields(body, CATEGORY_FIELDS);
  const names = Object.keys(fields);
  const result = await database.query(
    `INSERT INTO public.menu_categories (merchant_id,${names.join(',')})
     VALUES ($1,${names.map((_, i) => `$${i + 2}`).join(',')}) RETURNING ${ADMIN_CATEGORY_SELECT}`,
    [merchantId, ...names.map((key) => fields[key])],
  );
  return result.rows[0];
}

async function updateCategory(id, body) {
  const fields = pickFields(body, CATEGORY_FIELDS);
  const names = Object.keys(fields);
  if (!names.length) return null;
  const result = await database.query(
    `UPDATE public.menu_categories SET ${names.map((key, i) => `${key}=$${i + 1}`).join(',')}
     WHERE id=$${names.length + 1} RETURNING ${ADMIN_CATEGORY_SELECT}`,
    [...names.map((key) => fields[key]), id],
  );
  return result.rows[0] || null;
}

async function deleteCategory(id) {
  const result = await database.query(`DELETE FROM public.menu_categories WHERE id=$1`, [id]);
  return result.rowCount > 0;
}

async function categoryForMerchant(id) {
  const result = await database.query(
    `SELECT id,merchant_id FROM public.menu_categories WHERE id=$1`, [id],
  );
  return result.rows[0] || null;
}

async function insertItem(merchantId, body) {
  const fields = pickFields(body, ITEM_FIELDS);
  const names = Object.keys(fields);
  const result = await database.query(
    `INSERT INTO public.menu_items (merchant_id,${names.join(',')})
     VALUES ($1,${names.map((_, i) => `$${i + 2}`).join(',')}) RETURNING ${ADMIN_ITEM_SELECT}`,
    [merchantId, ...names.map((key) => encodeField(key, fields[key]))],
  );
  return result.rows[0];
}

async function itemPrices(id) {
  const result = await database.query(
    `SELECT price,net_price FROM public.menu_items WHERE id=$1`, [id],
  );
  return result.rows[0] || null;
}

async function updateItem(id, body) {
  const fields = pickFields(body, ITEM_FIELDS);
  const names = Object.keys(fields);
  if (!names.length) return null;
  const result = await database.query(
    `UPDATE public.menu_items SET ${names.map((key, i) => `${key}=$${i + 1}`).join(',')}
     WHERE id=$${names.length + 1} RETURNING ${MODERATE_ITEM_SELECT}`,
    [...names.map((key) => encodeField(key, fields[key])), id],
  );
  return result.rows[0] || null;
}

async function deleteItem(id) {
  const result = await database.query(`DELETE FROM public.menu_items WHERE id=$1`, [id]);
  return result.rowCount > 0;
}

const ORDER_SELECT = `o.id,o.order_code,o.status,o.payment_status,o.payment_method,o.subtotal,o.delivery_fee,
  o.platform_margin_total,o.vat_amount,o.total,o.delivery_address,o.delivery_street,o.delivery_building,
  o.contact_phone,o.created_at,o.accepted_at,
  m.id AS merchant_id,m.name AS merchant_name,
  c.full_name AS customer_full_name,c.mobile_number AS customer_mobile_number,
  d.order_id AS delivery_row_id,d.driver_id AS delivery_driver_id,d.status AS delivery_status,
  d.pickup_photo_path,d.delivery_photo_path,dp.full_name AS driver_full_name,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('name_snapshot',i.name_snapshot,'size_snapshot',i.size_snapshot,
      'quantity',i.quantity,'line_total',i.line_total) ORDER BY i.created_at)
      FROM public.order_items i WHERE i.order_id=o.id),'[]'::jsonb) AS order_items`;

function nestOrder(row) {
  const {
    merchant_id, merchant_name,
    customer_full_name, customer_mobile_number,
    delivery_row_id, delivery_driver_id, delivery_status, pickup_photo_path, delivery_photo_path, driver_full_name,
    order_items,
    ...order
  } = row;
  return {
    ...order,
    merchants: merchant_id ? { id: merchant_id, name: merchant_name } : null,
    profiles: (customer_full_name != null || customer_mobile_number != null)
      ? { full_name: customer_full_name, mobile_number: customer_mobile_number }
      : null,
    deliveries: delivery_row_id
      ? {
          driver_id: delivery_driver_id,
          status: delivery_status,
          pickup_photo_path,
          delivery_photo_path,
          profiles: driver_full_name != null ? { full_name: driver_full_name } : null,
        }
      : null,
    order_items: order_items,
  };
}

async function listOrders({ status, paymentStatus, limit = 100, offset = 0, search, sortBy, sortOrder, filters }) {
  const values = [];
  let where = '';
  if (status) { values.push(status); where += ` AND o.status=$${values.length}`; }
  if (paymentStatus) { values.push(paymentStatus); where += ` AND o.payment_status=$${values.length}`; }
  
  // Handle filters object
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      if (['status', 'paymentStatus'].includes(key)) return; // Already handled
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
  const countQuery = `SELECT count(*)::int AS total FROM public.orders o
    LEFT JOIN public.merchants m ON m.id=o.merchant_id
    LEFT JOIN public.profiles c ON c.id=o.customer_id
    WHERE true${where}`;
  const countResult = await database.query(countQuery, values.slice());
  const total = countResult.rows[0].total;
  
  values.push(limit, offset);
  const result = await database.query(
    `SELECT ${ORDER_SELECT} FROM public.orders o
       LEFT JOIN public.merchants m ON m.id=o.merchant_id
       LEFT JOIN public.profiles c ON c.id=o.customer_id
       LEFT JOIN public.deliveries d ON d.order_id=o.id
       LEFT JOIN public.profiles dp ON dp.id=d.driver_id
     WHERE true${where} ORDER BY o.${safeSortBy} ${safeSortOrder} LIMIT $${values.length-1} OFFSET $${values.length}`,
    values,
  );
  return { rows: result.rows.map(nestOrder), total };
}

async function awaitingPaymentsForOrders(orderIds) {
  if (!orderIds.length) return [];
  const result = await database.query(
    `SELECT order_id,gateway_transaction_id,gateway_raw,created_at
       FROM public.order_payments WHERE order_id = ANY($1) AND status='awaiting'
      ORDER BY created_at DESC`,
    [orderIds],
  );
  return result.rows;
}

async function loadOrderByCode(code) {
  const result = await database.query(
    `SELECT * FROM public.orders WHERE order_code=$1`, [code],
  );
  return result.rows[0] || null;
}

async function driverForAssignment(id) {
  const result = await database.query(
    `SELECT id,role,full_name,whatsapp_number,mobile_number,driver_approved
       FROM public.profiles WHERE id=$1`, [id],
  );
  return result.rows[0] || null;
}

async function upsertDelivery({ orderId, driverId, fee, status }) {
  await database.query(
    `INSERT INTO public.deliveries (order_id,driver_id,fee,status) VALUES ($1,$2,$3,$4)
     ON CONFLICT (order_id) DO UPDATE SET driver_id=$2,fee=$3,status=$4`,
    [orderId, driverId, fee, status],
  );
}

async function promoteAwaitingPayments(orderId) {
  const result = await database.query(
    `UPDATE public.order_payments SET status='paid' WHERE order_id=$1 AND status='awaiting' RETURNING id`,
    [orderId],
  );
  return result.rowCount;
}

async function failAwaitingPayments(orderId) {
  await database.query(
    `UPDATE public.order_payments SET status='failed' WHERE order_id=$1 AND status='awaiting'`, [orderId],
  );
}

async function refundPaidPayments(orderId) {
  await database.query(
    `UPDATE public.order_payments SET status='refunded' WHERE order_id=$1 AND status='paid'`, [orderId],
  );
}

async function setOrderPaymentStatus(orderId, status) {
  await database.query(`UPDATE public.orders SET payment_status=$2 WHERE id=$1`, [orderId, status]);
}

async function deliveryPhotos(orderId) {
  const result = await database.query(
    `SELECT pickup_photo_path,delivery_photo_path FROM public.deliveries WHERE order_id=$1`, [orderId],
  );
  return result.rows[0] || null;
}

async function settlementPage({ from, toExclusive, limit, offset }) {
  const result = await database.query(
    `SELECT o.order_code,o.created_at,o.status,o.payment_status,o.payment_method,
            o.subtotal,o.delivery_fee,o.driver_fee,o.platform_margin_total,o.vat_amount,o.total,
            m.id AS merchant_id,m.name AS merchant_name
       FROM public.orders o LEFT JOIN public.merchants m ON m.id=o.merchant_id
      WHERE o.created_at>=$1 AND o.created_at<$2
        AND (o.status NOT IN ('pending','cancelled','rejected') OR o.payment_status='refunded')
      ORDER BY o.created_at DESC LIMIT $3 OFFSET $4`,
    [from.toISOString(), toExclusive.toISOString(), limit, offset],
  );
  return result.rows.map((o) => ({
    ...o,
    merchants: o.merchant_id ? { id: o.merchant_id, name: o.merchant_name } : null,
  }));
}

module.exports = {
  loadMerchant, overview, listRefunds, listMerchants, emailsByIds,
  insertMerchant, updateMerchant, liveOrderCount, deleteMerchant, setMerchantStatus,
  replenishMerchantCredit, insertCreditLedger, linkMerchantOwner,
  menuForMerchant, insertCategory, updateCategory, deleteCategory,
  categoryForMerchant, insertItem, itemPrices, updateItem, deleteItem,
  listOrders, awaitingPaymentsForOrders, loadOrderByCode,
  driverForAssignment, upsertDelivery,
  promoteAwaitingPayments, failAwaitingPayments, refundPaidPayments,
  setOrderPaymentStatus, deliveryPhotos, settlementPage,
};
