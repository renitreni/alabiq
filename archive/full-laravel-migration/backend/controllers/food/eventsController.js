// ---------------------------------------------------------------------
// Food Delivery — client analytics intake
//   - recordEvent : POST /api/food/events { event_name, merchant_id?, params? }
//
// Browsers may report the discovery/engagement events (view_menu,
// add_to_cart, checkout_attempt); all money/ops events are written
// server-side by their flows and are rejected here. Anonymous events are
// allowed (discovery is public) — a valid bearer token tags the user.
// ---------------------------------------------------------------------
const { CLIENT_EVENTS, logFoodEvent } = require('../../lib/foodEvents');

async function recordEvent(req, res) {
  try {
    const { event_name, merchant_id, order_id, params } = req.body;
    if (!CLIENT_EVENTS.includes(event_name)) {
      return res.status(400).json({
        error: `event_name must be one of: ${CLIENT_EVENTS.join(', ')}`,
      });
    }
    await logFoodEvent({
      eventName: event_name,
      userId: req.userId || null,
      merchantId: merchant_id || null,
      orderId: order_id || null,
      params: params || null,
    });
    return res.status(202).json({ recorded: true });
  } catch (err) {
    console.error('recordEvent error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { recordEvent };
