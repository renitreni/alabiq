'use strict';

const database = require('../lib/database/pool');

async function upsertOwnerMerchant(payload) {
  const { rows } = await database.query(
    `INSERT INTO public.merchants(owner_id,name,cuisine_type,description,logo_url,address,lat,lng,is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (owner_id) DO UPDATE SET
       name=EXCLUDED.name,cuisine_type=EXCLUDED.cuisine_type,description=EXCLUDED.description,
       logo_url=EXCLUDED.logo_url,address=EXCLUDED.address,lat=EXCLUDED.lat,lng=EXCLUDED.lng,
       updated_at=now()
     RETURNING id,name,cuisine_type,description,logo_url,address,lat,lng,is_active,status`,
    [payload.owner_id,payload.name,payload.cuisine_type,payload.description,payload.logo_url,
      payload.address,payload.lat,payload.lng,payload.is_active],
  );
  return rows[0];
}

async function getByOwner(ownerId) {
  const { rows } = await database.query(
    `SELECT id,name,vertical,is_active,status,credit_limit,credit_used
     FROM public.merchants WHERE owner_id=$1 LIMIT 1`, [ownerId],
  );
  return rows[0] || null;
}

async function loadOwned(ownerId) {
  const { rows } = await database.query(
    `SELECT id,name,vertical,cuisine_type,description,logo_url,address,street,building_number,
            lat,lng,is_active,status,credit_limit,credit_used,is_featured,badge,created_at
       FROM public.merchants WHERE owner_id=$1 LIMIT 1`, [ownerId],
  );
  return rows[0] || null;
}

async function updateProfile({ id, ownerId, fields }) {
  const columns = ['name','cuisine_type','description','logo_url','address','street','building_number','lat','lng'];
  const values = columns.map((column) => fields[column]);
  const { rows } = await database.query(
    `UPDATE public.merchants SET name=$1,cuisine_type=$2,description=$3,logo_url=$4,
       address=$5,street=$6,building_number=$7,lat=$8,lng=$9
     WHERE id=$10 AND owner_id=$11
     RETURNING id,name,vertical,cuisine_type,description,logo_url,address,street,building_number,
       lat,lng,is_active,status,credit_limit,credit_used,is_featured,badge,created_at`,
    [...values, id, ownerId],
  );
  return rows[0] || null;
}

async function menuForMerchant(merchantId) {
  const [categories, items] = await Promise.all([
    database.query(`SELECT id,name,sort_order,is_active FROM public.menu_categories
      WHERE merchant_id=$1 ORDER BY sort_order`, [merchantId]),
    database.query(`SELECT id,category_id,name,description,price,item_type,image_url,is_available,size_options
      FROM public.menu_items WHERE merchant_id=$1 ORDER BY name`, [merchantId]),
  ]);
  return { categories: categories.rows, items: items.rows };
}

const CATEGORY_COLUMNS = ['name','sort_order','is_active'];
const ITEM_COLUMNS = ['category_id','name','description','price','item_type','image_url','is_available','size_options'];
// jsonb columns: node-pg serializes JS arrays as Postgres array literals,
// which are NOT valid JSON — stringify them explicitly.
function encodeField(column, value) {
  return column === 'size_options' && value != null ? JSON.stringify(value) : value;
}

async function insertOwnedRow(table, columns, merchantId, fields, returning) {
  const selected = columns.filter((column) => Object.hasOwn(fields, column));
  const values = [merchantId, ...selected.map((column) => encodeField(column, fields[column]))];
  const names = ['merchant_id', ...selected];
  const params = names.map((_, i) => `$${i + 1}`);
  const { rows } = await database.query(
    `INSERT INTO public.${table} (${names.join(',')}) VALUES (${params.join(',')}) RETURNING ${returning}`,
    values,
  );
  return rows[0];
}

async function updateOwnedRow(table, columns, id, merchantId, fields, returning) {
  const selected = columns.filter((column) => Object.hasOwn(fields, column));
  if (!selected.length) return null;
  const values = selected.map((column) => encodeField(column, fields[column]));
  const set = selected.map((column, index) => `${column}=$${index + 1}`).join(',');
  const { rows } = await database.query(
    `UPDATE public.${table} SET ${set} WHERE id=$${values.length + 1} AND merchant_id=$${values.length + 2}
      RETURNING ${returning}`,
    [...values, id, merchantId],
  );
  return rows[0] || null;
}

async function categoryOwned(id, merchantId) {
  const { rows } = await database.query(
    'SELECT id FROM public.menu_categories WHERE id=$1 AND merchant_id=$2', [id, merchantId],
  );
  return !!rows[0];
}

async function deleteOwnedRow(table, id, merchantId) {
  const result = await database.query(
    `DELETE FROM public.${table} WHERE id=$1 AND merchant_id=$2`, [id, merchantId],
  );
  return result.rowCount > 0;
}

async function analytics(merchantId) {
  const [orders, items] = await Promise.all([
    database.query(`SELECT status, count(*)::int AS count,
        count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today_count,
        coalesce(sum(total) FILTER (WHERE status='delivered'),0)::numeric(14,2) AS delivered_total
      FROM public.orders WHERE merchant_id=$1 GROUP BY status`, [merchantId]),
    database.query('SELECT count(*)::int AS count FROM public.menu_items WHERE merchant_id=$1', [merchantId]),
  ]);
  return { orderStats: orders.rows, menuItemCount: items.rows[0]?.count || 0 };
}

module.exports = {
  upsertOwnerMerchant, getByOwner, loadOwned, updateProfile, menuForMerchant,
  insertCategory: (merchantId, fields) => insertOwnedRow('menu_categories', CATEGORY_COLUMNS, merchantId, fields, 'id,name,sort_order,is_active'),
  updateCategory: (id, merchantId, fields) => updateOwnedRow('menu_categories', CATEGORY_COLUMNS, id, merchantId, fields, 'id,name,sort_order,is_active'),
  categoryOwned,
  deleteCategory: (id, merchantId) => deleteOwnedRow('menu_categories', id, merchantId),
  insertMenuItem: (merchantId, fields) => insertOwnedRow('menu_items', ITEM_COLUMNS, merchantId, fields, 'id,category_id,name,description,price,item_type,image_url,is_available,size_options'),
  updateMenuItem: (id, merchantId, fields) => updateOwnedRow('menu_items', ITEM_COLUMNS, id, merchantId, fields, 'id,category_id,name,description,price,item_type,image_url,is_available,size_options'),
  deleteMenuItem: (id, merchantId) => deleteOwnedRow('menu_items', id, merchantId),
  analytics,
};
