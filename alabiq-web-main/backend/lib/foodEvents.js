// ---------------------------------------------------------------------
// Food Delivery analytics events (PRD §9).
//
// One writer for fd_analytics_events so event names stay consistent
// (lowercase_with_underscores) whether the event comes from a server
// flow (checkout, accept, credit alerts) or from the client via
// POST /api/food/events. Best-effort: analytics must never break the
// request that produced them.
// ---------------------------------------------------------------------
const database = require('./database/pool');

// The full PRD event vocabulary. Client-submitted events are restricted
// to the discovery/engagement subset below.
const FOOD_EVENTS = [
  'view_menu',
  'add_to_cart',
  'checkout_attempt',
  'payment_success',
  'merchant_order_accept',
  'credit_limit_warning',
  'service_suspended',
];

// Events a browser may report directly; everything else is server-observed.
const CLIENT_EVENTS = ['view_menu', 'add_to_cart', 'checkout_attempt'];

// The Ecommerce vocabulary. Shares this table (and the 0016 retention job)
// via the shop_order_id column added in migration 0028 — the fd_ table name
// is now a misnomer, but renaming it would break that job and every
// existing query.
const SHOP_EVENTS = [
  'view_store',
  'add_to_cart',
  'checkout_attempt',
  'payment_success',
  'merchant_order_accept',
  'out_of_stock_block',
  'low_stock_reached',
  'credit_limit_warning',
  'service_suspended',
];

// Same discovery/engagement subset rule as food.
const SHOP_CLIENT_EVENTS = ['view_store', 'add_to_cart', 'checkout_attempt'];

async function logFoodEvent({ eventName, userId = null, orderId = null, merchantId = null, params = null }) {
  try {
    if (!FOOD_EVENTS.includes(eventName)) {
      console.error(`logFoodEvent: unknown event "${eventName}" ignored`);
      return;
    }
    await database.query(
      `INSERT INTO public.fd_analytics_events(event_name,user_id,order_id,merchant_id,params)
       VALUES ($1,$2,$3,$4,$5)`, [eventName,userId,orderId,merchantId,params],
    );
  } catch (err) {
    console.error('logFoodEvent error:', err.message || err);
  }
}

async function logShopEvent({ eventName, userId = null, shopOrderId = null, merchantId = null, params = null }) {
  try {
    if (!SHOP_EVENTS.includes(eventName)) {
      console.error(`logShopEvent: unknown event "${eventName}" ignored`);
      return;
    }
    await database.query(
      `INSERT INTO public.fd_analytics_events(event_name,user_id,shop_order_id,merchant_id,params)
       VALUES ($1,$2,$3,$4,$5)`, [eventName,userId,shopOrderId,merchantId,params],
    );
  } catch (err) {
    console.error('logShopEvent error:', err.message || err);
  }
}

module.exports = {
  FOOD_EVENTS,
  CLIENT_EVENTS,
  logFoodEvent,
  SHOP_EVENTS,
  SHOP_CLIENT_EVENTS,
  logShopEvent,
};
