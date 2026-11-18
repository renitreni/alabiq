// ---------------------------------------------------------------------
// Notification helpers.
//
// Every alert is written to the recipient's inbox and, when configured, sent
// to that recipient's registered web-push devices.
// ---------------------------------------------------------------------
const database = require('./database/pool');
const { sendWebPush } = require('./webPush');

const COPY = {
  ride_booking_created: {
    title: 'New ride booking',
    body: 'A customer created a new airport transfer booking.',
  },
  ride_offer: {
    title: 'New ride request',
    body: 'A nearby trip is available. Open Alabiq to respond.',
  },
  ride_driver_accepted: {
    title: 'A driver accepted your trip',
    body: 'Your driver is on the way to you.',
  },
  ride_driver_on_the_way: { title: 'Your driver is on the way', body: 'Track their live location.' },
  ride_driver_arrived: { title: 'Your driver has arrived', body: 'Please head to the pickup point.' },
  ride_trip_started: { title: 'Your trip started', body: 'You are on the way to your destination.' },
  ride_completed: { title: 'Trip completed', body: 'Your invoice is ready.' },
  ride_cancelled: { title: 'Trip cancelled', body: 'This booking was cancelled.' },
  admin_food_order_created: {
    title: 'New food order',
    body: 'A customer placed a new restaurant order.',
  },
  merchant_food_order_created: {
    title: 'New restaurant order',
    body: 'A customer placed a new food order.',
  },
  delivery_offer: {
    title: 'New delivery request',
    body: 'A nearby food delivery is available. Open Alabiq to respond.',
  },
  food_rider_assigned: { title: 'A rider was assigned', body: 'The rider is heading to the restaurant.' },
  food_delivery_assigned: { title: 'New delivery assigned', body: 'Open the driver portal for details.' },
  food_order_accepted: { title: 'Restaurant accepted your order', body: 'Your order is being prepared.' },
  food_order_rejected: { title: 'Order rejected', body: 'The restaurant could not accept your order.' },
  food_order_preparing: { title: 'Your order is being prepared', body: 'The kitchen is preparing your food.' },
  // The three below are the "kitchen never started" chase — see
  // lib/foodPreparingReminder.js. They repeat every reminder interval.
  food_order_preparing_reminder: {
    title: 'Start preparing this order',
    body: 'An order is still waiting. Tap "Start preparing" so the customer knows the kitchen began.',
  },
  admin_food_order_preparing_overdue: {
    title: 'Restaurant has not started preparing',
    body: 'An order is past the reminder window and still not in the kitchen.',
  },
  food_order_delayed: {
    title: 'Your order is taking a little longer',
    body: 'We are following up with the restaurant.',
  },
  food_order_ready: { title: 'Your order is ready', body: 'Waiting for a rider to pick it up.' },
  food_order_out_for_delivery: { title: 'Your order was picked up', body: 'Your rider is on the way.' },
  food_order_delivered: { title: 'Order delivered', body: 'Enjoy your meal!' },
  food_order_cancelled: { title: 'Order cancelled', body: 'This order will not be delivered.' },
  // Separate from the generic cancel: the customer needs to know it was
  // the restaurant's decision, not ours and not a payment problem.
  food_order_cancelled_by_store: {
    title: 'The restaurant cancelled your order',
    body: 'Open the order to see why. Any payment you made will be refunded.',
  },

  // --- Ecommerce ("shop") ---
  shop_order_placed: { title: 'Order placed', body: 'We have your order. Complete payment to confirm it.' },
  shop_order_new: { title: 'New store order', body: 'A customer placed a new order.' },
  shop_payment_pending: { title: 'Payment proof to review', body: 'A store order is waiting for verification.' },
  shop_payment_confirmed: { title: 'Payment confirmed', body: 'Your order is confirmed.' },
  shop_payment_rejected: { title: 'Payment could not be verified', body: 'Please upload a valid transfer receipt.' },
  shop_order_accepted: { title: 'Store accepted your order', body: 'Your items are being packed.' },
  shop_order_rejected: { title: 'Order rejected', body: 'The store could not accept your order.' },
  shop_order_packing: { title: 'Your order is being packed', body: 'The store is preparing your items.' },
  shop_order_ready: { title: 'Your order is packed', body: 'Waiting for a rider to pick it up.' },
  shop_order_out_for_delivery: { title: 'Your order was picked up', body: 'Your rider is on the way.' },
  shop_order_delivered: { title: 'Order delivered', body: 'Thanks for shopping with Alabiq.' },
  shop_order_cancelled: { title: 'Order cancelled', body: 'This order will not be delivered.' },
  shop_order_cancelled_by_store: {
    title: 'The store cancelled your order',
    body: 'Open the order to see why. Any payment you made will be refunded.',
  },
  shop_order_expired: {
    title: 'Order expired',
    body: 'We released your items because payment was not completed in time.',
  },
  shop_delivery_offer: {
    title: 'New delivery request',
    body: 'A nearby store delivery is available. Open Alabiq to respond.',
  },
  shop_delivery_assigned: { title: 'New delivery assigned', body: 'Open the driver portal for details.' },
  shop_delivery_released: {
    title: 'Delivery handed back',
    body: 'This order has been offered to another rider.',
  },
  shop_delivery_reclaimed: {
    title: 'Delivery reassigned',
    body: 'We lost your location for a while, so this order went to another rider.',
  },
  shop_rider_assigned: { title: 'A rider was assigned', body: 'The rider is heading to the store.' },
  shop_finding_new_rider: { title: 'Finding you a new rider', body: 'We are matching another rider to your order.' },
  shop_low_stock: { title: 'Product running low', body: 'One of your products is at or below its low-stock line.' },
};

function notificationCopy(type, title, body) {
  const defaults = COPY[type] || {};
  return {
    title: title || defaults.title || 'Alabiq notification',
    body: body || defaults.body || 'Open Alabiq to view the update.',
  };
}

// Record that a notification was (or would be) sent. Never throws — a logging
// failure must not break the request that triggered it.
//
// Besides the audit row it also sends the alert to the user's registered push
// subscriptions. The optional `code` lets the client deep-link the alert.
async function logNotification({
  userId = null,
  bookingId = null,
  orderId = null,
  shopOrderId = null,
  type,
  channel = 'in_app',
  code = null,
  title = null,
  body = null,
  url = '/notifications',
}) {
  if (!userId) return null;
  try {
    const sentAt = new Date().toISOString();
    const copy = notificationCopy(type, title, body);
    const { rows } = await database.query(
      `INSERT INTO public.notification_events(user_id,booking_id,order_id,shop_order_id,type,channel,code,sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,type,booking_id,order_id,shop_order_id,code,channel,read_at,sent_at,created_at`,
      [userId,bookingId,orderId,shopOrderId,type,channel,code,sentAt],
    );
    const data = rows[0];

    const payload = {
      id: data.id,
      type: data.type,
      code: data.code,
      channel: data.channel,
      read_at: data.read_at,
      sent_at: data.sent_at,
      created_at: data.created_at,
    };
    await sendWebPush(userId, {
      ...copy,
      ...payload,
      type,
      url,
      tag: `alabiq-${data.id}`,
    });
    return data;
  } catch (err) {
    console.error('logNotification error:', err.message || err);
    return null;
  }
}

async function notifyAdmins(notification) {
  const { rows } = await database.query("SELECT id FROM public.profiles WHERE role='admin'");
  await Promise.all(rows.map(({ id }) => logNotification({ ...notification, userId: id })));
}

module.exports = { logNotification, notifyAdmins };
