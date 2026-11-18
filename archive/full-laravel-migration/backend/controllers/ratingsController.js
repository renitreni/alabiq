// ---------------------------------------------------------------------
// Driver star ratings (Food Delivery + Pick & Drop).
//   - rateFoodDriver : POST /api/food/orders/:code/rate-driver
//   - rateRideDriver : POST /api/bookings/:code/rate-driver
//
// One rating per order/booking (DB unique), written only by the job's
// own customer, only after the job actually finished. Stars 1-5 with an
// optional comment.
// ---------------------------------------------------------------------
const database = require('../lib/database/pool');
const { logAudit } = require('../lib/audit');

async function insertRating(
  res,
  { driverId, customerId, orderId = null, bookingId = null, shopOrderId = null, stars, comment }
) {
  try {
    await database.query(`INSERT INTO public.driver_ratings
      (driver_id,customer_id,order_id,booking_id,shop_order_id,stars,comment)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [driverId,customerId,orderId,bookingId,shopOrderId,stars,comment || null]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'You already rated this driver' });
    }
    console.error('insertRating error:', error);
    return res.status(500).json({ error: 'Could not save your rating' });
  }
  return res.status(201).json({ rated: true, stars });
}

async function rateFoodDriver(req, res) {
  try {
    const { rows: orderRows } = await database.query(
      'SELECT id,order_code,customer_id,status FROM public.orders WHERE order_code=$1 LIMIT 1', [req.params.code]);
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.customer_id !== req.userId) {
      return res.status(403).json({ error: 'This order belongs to another account' });
    }
    if (order.status !== 'delivered') {
      return res.status(409).json({ error: 'You can rate the rider once the order is delivered' });
    }

    const { rows: deliveryRows } = await database.query(
      'SELECT driver_id FROM public.deliveries WHERE order_id=$1 LIMIT 1', [order.id]);
    const delivery = deliveryRows[0];
    if (!delivery || !delivery.driver_id) {
      return res.status(409).json({ error: 'No rider was assigned to this order' });
    }

    logAudit({
      actorId: req.userId,
      action: 'driver_rated',
      resourceType: 'order',
      resourceId: order.order_code,
      meta: { stars: req.body.stars },
    });
    return insertRating(res, {
      driverId: delivery.driver_id,
      customerId: req.userId,
      orderId: order.id,
      stars: req.body.stars,
      comment: req.body.comment,
    });
  } catch (err) {
    console.error('rateFoodDriver error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function rateRideDriver(req, res) {
  try {
    const { rows: bookingRows } = await database.query(
      'SELECT id,booking_code,user_id,booking_status,assigned_driver_id FROM public.bookings WHERE booking_code=$1 LIMIT 1', [req.params.code]);
    const booking = bookingRows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!booking.user_id || booking.user_id !== req.userId) {
      return res.status(403).json({ error: 'This booking belongs to another account' });
    }
    if (booking.booking_status !== 'completed') {
      return res.status(409).json({ error: 'You can rate the driver once the trip is completed' });
    }
    if (!booking.assigned_driver_id) {
      return res.status(409).json({ error: 'No driver was assigned to this booking' });
    }

    logAudit({
      actorId: req.userId,
      action: 'driver_rated',
      resourceType: 'booking',
      resourceId: booking.booking_code,
      meta: { stars: req.body.stars },
    });
    return insertRating(res, {
      driverId: booking.assigned_driver_id,
      customerId: req.userId,
      bookingId: booking.id,
      stars: req.body.stars,
      comment: req.body.comment,
    });
  } catch (err) {
    console.error('rateRideDriver error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function rateShopDriver(req, res) {
  try {
    const { rows: orderRows } = await database.query(
      'SELECT id,order_code,customer_id,status FROM public.shop_orders WHERE order_code=$1 LIMIT 1', [req.params.code]);
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.customer_id !== req.userId) {
      return res.status(403).json({ error: 'This order belongs to another account' });
    }
    if (order.status !== 'delivered') {
      return res.status(409).json({ error: 'You can rate the rider once the order is delivered' });
    }

    const { rows: deliveryRows } = await database.query(
      'SELECT driver_id FROM public.shop_deliveries WHERE order_id=$1 LIMIT 1', [order.id]);
    const delivery = deliveryRows[0];
    if (!delivery || !delivery.driver_id) {
      return res.status(409).json({ error: 'No rider was assigned to this order' });
    }

    logAudit({
      actorId: req.userId,
      action: 'driver_rated',
      resourceType: 'shop_order',
      resourceId: order.order_code,
      meta: { stars: req.body.stars },
    });
    return insertRating(res, {
      driverId: delivery.driver_id,
      customerId: req.userId,
      shopOrderId: order.id,
      stars: req.body.stars,
      comment: req.body.comment,
    });
  } catch (err) {
    console.error('rateShopDriver error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { rateFoodDriver, rateRideDriver, rateShopDriver };
