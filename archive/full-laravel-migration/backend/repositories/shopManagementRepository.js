'use strict';

const database = require('../lib/database/pool');

async function storeByOwner(ownerId) {
  const result = await database.query(
    `SELECT id,name,vertical,cuisine_type,description,logo_url,address,street,building_number,
            lat,lng,is_active,status,credit_limit,credit_used,is_featured,badge,created_at
       FROM public.merchants WHERE owner_id=$1 AND vertical='shop' LIMIT 1`, [ownerId],
  );
  return result.rows[0] || null;
}

async function owned(table, id, merchantId) {
  const result = await database.query(`SELECT id FROM public.${table} WHERE id=$1 AND merchant_id=$2`, [id, merchantId]);
  return !!result.rows[0];
}

async function updateStore({ id, ownerId, fields }) {
  const allowed = ['name','cuisine_type','description','logo_url','address','street','building_number','lat','lng'];
  const columns = allowed.filter((key) => Object.hasOwn(fields, key));
  if (!columns.length) return storeByOwner(ownerId);
  const values = columns.map((key) => fields[key]);
  const set = columns.map((key, i) => `${key}=$${i + 1}`).join(',');
  const result = await database.query(
    `UPDATE public.merchants SET ${set} WHERE id=$${values.length + 1} AND owner_id=$${values.length + 2}
      RETURNING id,name,vertical,cuisine_type,description,logo_url,address,street,building_number,
        lat,lng,is_active,status,credit_limit,credit_used,is_featured,badge,created_at`,
    [...values, id, ownerId],
  );
  return result.rows[0] || null;
}

const CATEGORY_FIELDS = ['name','description','image_url','sort_order','is_active'];
const PRODUCT_FIELDS = ['category_id','name','description','image_url','price','is_available','brand','unit',
  'weight_grams','barcode','stock_quantity','low_stock_threshold','track_stock'];
const VARIANT_FIELDS = ['sku','label','price','stock_quantity','sort_order','is_available'];
const PRODUCT_RETURN = `id,category_id,name,description,brand,unit,weight_grams,barcode,price,
  image_url,stock_quantity,low_stock_threshold,track_stock,is_available,created_at`;
const VARIANT_RETURN = 'id,product_id,sku,label,price,stock_quantity,sort_order,is_available';

async function insertOwned(table, fields, merchantId, body, returning) {
  const keys = fields.filter((key) => Object.hasOwn(body, key));
  const names = ['merchant_id', ...keys];
  const values = [merchantId, ...keys.map((key) => body[key])];
  const params = names.map((_, i) => `$${i + 1}`);
  const result = await database.query(
    `INSERT INTO public.${table} (${names.join(',')}) VALUES (${params.join(',')}) RETURNING ${returning}`, values,
  );
  return result.rows[0];
}

async function updateOwned(table, fields, id, scopeColumn, scopeId, body, returning) {
  const keys = fields.filter((key) => Object.hasOwn(body, key));
  if (!keys.length) return null;
  const values = keys.map((key) => body[key]);
  const set = keys.map((key, i) => `${key}=$${i + 1}`).join(',');
  const result = await database.query(
    `UPDATE public.${table} SET ${set} WHERE id=$${values.length + 1} AND ${scopeColumn}=$${values.length + 2}
      RETURNING ${returning}`, [...values, id, scopeId],
  );
  return result.rows[0] || null;
}

async function deleteOwned(table, id, scopeColumn, scopeId) {
  const result = await database.query(`DELETE FROM public.${table} WHERE id=$1 AND ${scopeColumn}=$2`, [id, scopeId]);
  return result.rowCount > 0;
}

async function catalogue(merchantId) {
  const [categories, products] = await Promise.all([
    database.query(`SELECT id,name,sort_order,is_active FROM public.product_categories
      WHERE merchant_id=$1 ORDER BY sort_order`, [merchantId]),
    database.query(`SELECT ${PRODUCT_RETURN},COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',v.id,'product_id',v.product_id,'sku',v.sku,'label',v.label,'price',v.price,
        'stock_quantity',v.stock_quantity,'sort_order',v.sort_order,'is_available',v.is_available)
        ORDER BY v.sort_order) FROM public.product_variants v WHERE v.product_id=p.id),'[]'::jsonb) AS product_variants
      FROM public.products p WHERE merchant_id=$1 ORDER BY name`, [merchantId]),
  ]);
  return { categories: categories.rows, products: products.rows };
}

async function variantOwned(productId, variantId) {
  const result = await database.query('SELECT id FROM public.product_variants WHERE id=$1 AND product_id=$2', [variantId, productId]);
  return !!result.rows[0];
}

async function setProductStock(id, merchantId, stock) {
  const result = await database.query(`UPDATE public.products SET stock_quantity=$1
    WHERE id=$2 AND merchant_id=$3 RETURNING ${PRODUCT_RETURN}`, [stock,id,merchantId]);
  return result.rows[0] || null;
}

async function setVariantStock(id, productId, stock) {
  const result = await database.query(`UPDATE public.product_variants SET stock_quantity=$1
    WHERE id=$2 AND product_id=$3 RETURNING ${VARIANT_RETURN}`, [stock,id,productId]);
  return result.rows[0] || null;
}

async function analytics(merchantId) {
  const [orders, counts] = await Promise.all([
    database.query(`SELECT status,count(*)::int AS count,
       coalesce(sum(total) FILTER (WHERE status='delivered'),0)::numeric(14,2) AS delivered_total
       FROM public.shop_orders WHERE merchant_id=$1 GROUP BY status`, [merchantId]),
    database.query(`SELECT (SELECT count(*)::int FROM public.products WHERE merchant_id=$1) AS products,
       (SELECT count(*)::int FROM public.product_categories WHERE merchant_id=$1) AS categories`, [merchantId]),
  ]);
  return { orders: orders.rows, counts: counts.rows[0] || { products: 0, categories: 0 } };
}

module.exports = {
  storeByOwner, updateStore, owned,
  catalogue,
  insertCategory: (merchantId, body) => insertOwned('product_categories', CATEGORY_FIELDS, merchantId, body, 'id,name,sort_order,is_active'),
  updateCategory: (id, merchantId, body) => updateOwned('product_categories', CATEGORY_FIELDS, id, 'merchant_id', merchantId, body, 'id,name,sort_order,is_active'),
  deleteCategory: (id, merchantId) => deleteOwned('product_categories', id, 'merchant_id', merchantId),
  insertProduct: (merchantId, body) => insertOwned('products', PRODUCT_FIELDS, merchantId, body, PRODUCT_RETURN),
  updateProduct: (id, merchantId, body) => updateOwned('products', PRODUCT_FIELDS, id, 'merchant_id', merchantId, body, PRODUCT_RETURN),
  deleteProduct: (id, merchantId) => deleteOwned('products', id, 'merchant_id', merchantId),
  insertVariant: (productId, body) => {
    const keys = VARIANT_FIELDS.filter((key) => Object.hasOwn(body, key));
    const names = ['product_id', ...keys];
    return database.query(`INSERT INTO public.product_variants (${names.join(',')}) VALUES (${names.map((_,i)=>`$${i+1}`).join(',')}) RETURNING ${VARIANT_RETURN}`,
      [productId, ...keys.map((key)=>body[key])]).then((result)=>result.rows[0]);
  },
  updateVariant: (id, productId, body) => updateOwned('product_variants', VARIANT_FIELDS, id, 'product_id', productId, body, VARIANT_RETURN),
  deleteVariant: (id, productId) => deleteOwned('product_variants', id, 'product_id', productId),
  variantOwned, setProductStock, setVariantStock, analytics,
};
