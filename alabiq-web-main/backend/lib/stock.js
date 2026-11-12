// ---------------------------------------------------------------------
// Ecommerce stock — thin wrappers over the two Postgres RPCs from
// migration 0028.
//
// WHY DATABASE FUNCTIONS AND NOT APPLICATION CODE: these writes span multiple
// rows and must share one PostgreSQL transaction.
// Checkout decrements stock across N products AND writes four tables. Done
// as sequential statements, a failure halfway through leaves stock held for
// an order that does not exist, or an order for stock nobody reserved.
// shop_place_order() does the whole thing in one transaction, and the
// stock check rides on the UPDATE itself (`stock_quantity >= qty`) so two
// concurrent checkouts for the last unit cannot both win.
//
// This also implements handbook Part 13 §13.11.1 P3 ("move multi-table
// writes into Postgres RPCs") for the vertical.
// ---------------------------------------------------------------------
const database = require('./database/pool');

// Postgres raises this SQLSTATE from shop_place_order when a line is short.
const OUT_OF_STOCK = 'SM001';

// Pull the structured payload the RPC put in DETAIL. Supabase surfaces it
// on error.details as a JSON string; fall back to a generic shape so a
// change in the client's error mapping can never crash checkout.
function parseShortfall(error) {
  try {
    const parsed = JSON.parse(error.detail || error.details);
    if (parsed && parsed.failure_reason === 'out_of_stock') return parsed;
  } catch {
    /* not JSON — fall through */
  }
  return { failure_reason: 'out_of_stock', product: '', requested: null, available: null };
}

// Place an order atomically: reserve stock, insert the order and its line
// snapshots, empty the cart. Money is computed by lib/shopMoney.js and
// passed in — this function never prices anything.
//
// Returns { ok: true, orderId, orderCode }
//      or { ok: false, failureReason: 'out_of_stock', product, requested, available }
//      or { ok: false, failureReason: 'server_error', error }
async function placeShopOrder({ order, lines }) {
  try {
    const { rows } = await database.query('SELECT public.shop_place_order($1::jsonb,$2::jsonb) AS result', [order,lines]);
    const data = rows[0].result;
    return { ok: true, orderId: data.order_id, orderCode: data.order_code };
  } catch (error) {
    if (error.code === OUT_OF_STOCK) {
      const detail = parseShortfall(error);
      return {
        ok: false,
        failureReason: 'out_of_stock',
        product: detail.product || '',
        requested: detail.requested ?? null,
        available: detail.available ?? null,
      };
    }
    console.error('placeShopOrder rpc error:', error);
    return { ok: false, failureReason: 'server_error', error };
  }
}

// Put stock back. Idempotent at the database level via
// shop_orders.stock_released_at, so a retried cancel — or a cancel followed
// by a refund — cannot inflate inventory. Never throws: a failed release
// must not block the cancel/reject/refund it accompanies.
async function releaseShopStock(orderId) {
  try {
    const { rows } = await database.query('SELECT public.shop_release_stock($1) AS result', [orderId]);
    const data = rows[0].result;
    return data || { released: false, reason: 'unknown' };
  } catch (error) {
    console.error('releaseShopStock rpc error:', error);
    return { released: false, reason: 'rpc_error' };
  }
}

// Products at or below their low-stock line, worst first. Powers the
// merchant Inventory tab and the admin inventory view. Exact counts are
// fine here — both callers are already authorised to see them.
async function lowStockProducts(merchantId, { limit = 100 } = {}) {
  try {
    const { rows } = await database.query(
      `SELECT id,name,brand,unit,stock_quantity,low_stock_threshold,is_available,image_url
       FROM public.products WHERE merchant_id=$1 AND track_stock=true
       AND stock_quantity<=low_stock_threshold ORDER BY stock_quantity ASC LIMIT $2`, [merchantId,limit],
    );
    return rows;
  } catch (error) {
    console.error('lowStockProducts error:', error);
    return [];
  }
}

module.exports = { placeShopOrder, releaseShopStock, lowStockProducts, OUT_OF_STOCK };
