// ---------------------------------------------------------------------
// Ecommerce — client analytics intake
//   - recordEvent : POST /api/shop/events { event_name, merchant_id?, params? }
//
// Browsers may report the discovery/engagement events (view_store,
// add_to_cart, checkout_attempt); all money/ops/stock events are written
// server-side by their flows and are rejected here. In particular
// out_of_stock_block and low_stock_reached are NOT client-postable — they
// would otherwise be a way to inject false inventory telemetry.
// Anonymous events are allowed (discovery is public); a valid bearer token
// tags the user.
// ---------------------------------------------------------------------
const { SHOP_CLIENT_EVENTS, logShopEvent } = require('../../lib/foodEvents');

async function recordEvent(req, res) {
  try {
    const { event_name, merchant_id, shop_order_id, params } = req.body;
    if (!SHOP_CLIENT_EVENTS.includes(event_name)) {
      return res.status(400).json({
        error: `event_name must be one of: ${SHOP_CLIENT_EVENTS.join(', ')}`,
      });
    }
    await logShopEvent({
      eventName: event_name,
      userId: req.userId || null,
      merchantId: merchant_id || null,
      shopOrderId: shop_order_id || null,
      params: params || null,
    });
    return res.status(202).json({ recorded: true });
  } catch (err) {
    console.error('shop recordEvent error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { recordEvent };
