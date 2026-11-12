'use strict';

const database = require('../lib/database/pool');
const MERCHANT_FIELDS = `id,name,cuisine_type,description,logo_url,address,lat,lng,
  service_radius_km,is_featured,badge,accepting_orders`;

async function listMerchants(vertical, { q = '', category = '', featured = false, limit = 100 } = {}) {
  const values = [vertical];
  const clauses = ["vertical=$1", "is_active=true", "status='active'"];
  if (q) {
    values.push(`%${q.replace(/[%_]/g, '\\$&')}%`);
    clauses.push(`name ILIKE $${values.length} ESCAPE E'\\\\'`);
  }
  if (category) { values.push(category); clauses.push(`cuisine_type=$${values.length}`); }
  if (featured) clauses.push('is_featured=true');
  values.push(limit);
  const result = await database.query(
    `SELECT ${MERCHANT_FIELDS} FROM public.merchants WHERE ${clauses.join(' AND ')}
      ORDER BY is_featured DESC,name LIMIT $${values.length}`, values,
  );
  return result.rows;
}

async function cuisines(vertical) {
  const result = await database.query(
    `SELECT DISTINCT cuisine_type FROM public.merchants
      WHERE vertical=$1 AND is_active=true AND status='active' AND cuisine_type IS NOT NULL`, [vertical],
  );
  return result.rows;
}

async function ratings(vertical, merchantIds) {
  if (!merchantIds.length) return [];
  const table = vertical === 'shop' ? 'shop_ratings' : 'ratings';
  const column = vertical === 'shop' ? 'product_rating' : 'food_rating';
  const result = await database.query(
    `SELECT merchant_id,round(avg(${column})::numeric,1) AS rating,count(*)::int AS review_count
       FROM public.${table} WHERE merchant_id=ANY($1::uuid[]) GROUP BY merchant_id`, [merchantIds],
  );
  return result.rows;
}

async function menuCounts(merchantIds) {
  if (!merchantIds.length) return [];
  const result = await database.query(
    `SELECT merchant_id,count(*)::int AS item_count FROM public.menu_items
      WHERE merchant_id=ANY($1::uuid[]) GROUP BY merchant_id`, [merchantIds],
  );
  return result.rows;
}

async function hours(merchantIds) {
  if (!merchantIds.length) return [];
  const result = await database.query(
    `SELECT merchant_id,weekday,opens_at,closes_at FROM public.merchant_hours
      WHERE merchant_id=ANY($1::uuid[]) ORDER BY merchant_id,weekday,opens_at`, [merchantIds],
  );
  return result.rows;
}

async function merchantById(vertical, id) {
  const result = await database.query(
    `SELECT ${MERCHANT_FIELDS},vertical,is_active,status FROM public.merchants WHERE id=$1 AND vertical=$2`, [id, vertical],
  );
  return result.rows[0] || null;
}

async function menuCategories(merchantId) {
  const result = await database.query(
    `SELECT id,name,sort_order FROM public.menu_categories
      WHERE merchant_id=$1 AND is_active=true ORDER BY sort_order`, [merchantId],
  );
  return result.rows;
}

async function menuItems(merchantId) {
  const result = await database.query(
    `SELECT id,category_id,name,description,price,item_type,image_url,is_available,size_options
       FROM public.menu_items WHERE merchant_id=$1 ORDER BY name`, [merchantId],
  );
  return result.rows;
}

async function products(merchantId) {
  const result = await database.query(
    `SELECT p.id,p.category_id,p.name,p.description,p.brand,p.unit,p.weight_grams,p.price,p.image_url,
            p.is_available,p.track_stock,p.stock_quantity,p.low_stock_threshold,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'label',v.label,'sku',v.sku,
              'price',v.price,'stock_quantity',v.stock_quantity,'sort_order',v.sort_order,
              'is_available',v.is_available) ORDER BY v.sort_order)
              FROM public.product_variants v WHERE v.product_id=p.id),'[]'::jsonb) AS product_variants
       FROM public.products p WHERE p.merchant_id=$1 ORDER BY p.name`, [merchantId],
  );
  return result.rows;
}

module.exports = {
  listMerchants, cuisines, ratings, menuCounts, hours, merchantById,
  menuCategories, menuItems, products,
};
