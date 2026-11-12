'use strict';

const database = require('../lib/database/pool');
const VERTICALS = Object.freeze({
  food: { orders: 'orders', deliveries: 'deliveries', code: 'order_code' },
  shop: { orders: 'shop_orders', deliveries: 'shop_deliveries', code: 'order_code' },
  ride: { orders: 'bookings', deliveries: null, code: 'booking_code' },
});

async function listOffers(driverId, now = new Date()) {
  const result = await database.query(
    `SELECT f.id,f.order_id,f.shop_order_id,f.booking_id,f.distance_km,f.expires_at,
       fo.order_code AS food_code,fo.total AS food_total,fo.delivery_address AS food_dropoff,
       fo.delivery_street AS food_street,fo.delivery_building AS food_building,
       fm.name AS food_merchant,fm.address AS food_pickup,fm.street AS food_pickup_street,
       fm.building_number AS food_pickup_building,
       so.order_code AS shop_code,so.total AS shop_total,so.delivery_address AS shop_dropoff,
       so.delivery_street AS shop_street,so.delivery_building AS shop_building,
       sm.name AS shop_merchant,sm.address AS shop_pickup,sm.street AS shop_pickup_street,
       sm.building_number AS shop_pickup_building,
       b.booking_code,b.trip_type,b.pickup_address,b.pickup_street,b.pickup_building,
       b.dropoff_address,b.dropoff_street,b.dropoff_building,b.fare_amount
      FROM public.dispatch_offers f
      LEFT JOIN public.orders fo ON fo.id=f.order_id
      LEFT JOIN public.merchants fm ON fm.id=fo.merchant_id
      LEFT JOIN public.shop_orders so ON so.id=f.shop_order_id
      LEFT JOIN public.merchants sm ON sm.id=so.merchant_id
      LEFT JOIN public.bookings b ON b.id=f.booking_id
     WHERE f.driver_id=$1 AND f.status='pending' AND f.expires_at>$2`, [driverId, now],
  );
  return result.rows.map((r) => ({
    id:r.id, order_id:r.order_id, shop_order_id:r.shop_order_id, booking_id:r.booking_id,
    distance_km:r.distance_km, expires_at:r.expires_at,
    orders:r.order_id ? { order_code:r.food_code,total:r.food_total,delivery_address:r.food_dropoff,
      delivery_street:r.food_street,delivery_building:r.food_building,
      merchants:{name:r.food_merchant,address:r.food_pickup,street:r.food_pickup_street,building_number:r.food_pickup_building} } : null,
    shop_orders:r.shop_order_id ? { order_code:r.shop_code,total:r.shop_total,delivery_address:r.shop_dropoff,
      delivery_street:r.shop_street,delivery_building:r.shop_building,
      merchants:{name:r.shop_merchant,address:r.shop_pickup,street:r.shop_pickup_street,building_number:r.shop_pickup_building} } : null,
    bookings:r.booking_id ? { booking_code:r.booking_code,trip_type:r.trip_type,pickup_address:r.pickup_address,
      pickup_street:r.pickup_street,pickup_building:r.pickup_building,dropoff_address:r.dropoff_address,
      dropoff_street:r.dropoff_street,dropoff_building:r.dropoff_building,fare_amount:r.fare_amount } : null,
  }));
}

async function driverCashProfile(driverId) {
  const result = await database.query('SELECT cash_owed,cash_owed_limit FROM public.profiles WHERE id=$1',[driverId]);
  return result.rows[0] || null;
}
async function driverProfile(driverId, ride = false) {
  const columns = ride ? 'full_name,whatsapp_number' : 'full_name,whatsapp_number,mobile_number';
  const result = await database.query(`SELECT ${columns} FROM public.profiles WHERE id=$1`,[driverId]);
  return result.rows[0] || null;
}
async function claimDelivery(kind, orderId, driverId) {
  const source = VERTICALS[kind];
  const result = await database.query(
    `UPDATE public.${source.deliveries} SET driver_id=$1,status='assigned'
      WHERE order_id=$2 AND driver_id IS NULL RETURNING id`, [driverId,orderId],
  );
  return result.rows[0] || null;
}
async function ridePaymentMethod(id) {
  const result=await database.query('SELECT payment_method FROM public.bookings WHERE id=$1',[id]);
  return result.rows[0] || null;
}
async function claimRide(id, driverId) {
  const result=await database.query(`UPDATE public.bookings SET assigned_driver_id=$1,
      driver_ride_status='accepted',booking_status='driver_assigned'
    WHERE id=$2 AND assigned_driver_id IS NULL
    RETURNING id,booking_code,user_id`,[driverId,id]);
  return result.rows[0] || null;
}
async function acceptOffer({ id, driverId, now = new Date() }) {
  const result=await database.query(`UPDATE public.dispatch_offers SET status='accepted',responded_at=$1
      WHERE id=$2 AND driver_id=$3 AND status='pending' AND expires_at>$1
      RETURNING id,order_id,booking_id,shop_order_id`,[now,id,driverId]);
  return result.rows[0] || null;
}
async function orderById(kind,id) {
  const source=VERTICALS[kind];
  const result=await database.query(`SELECT id,order_code,booking_code,status,merchant_id,customer_id,user_id,
      payment_method,payment_status FROM public.${source.orders} WHERE id=$1`,[id]);
  return result.rows[0] || null;
}
async function cancelOffer(id) {
  await database.query("UPDATE public.dispatch_offers SET status='cancelled' WHERE id=$1",[id]);
}
async function bookingCodeById(id) {
  const result=await database.query('SELECT booking_code FROM public.bookings WHERE id=$1',[id]);
  return result.rows[0] || null;
}
async function declineOffer({id,driverId,now=new Date()}) {
  const result=await database.query(`UPDATE public.dispatch_offers SET status='declined',responded_at=$1
      WHERE id=$2 AND driver_id=$3 AND status='pending' RETURNING id,order_id,booking_id,shop_order_id`,[now,id,driverId]);
  return result.rows[0] || null;
}

const ORDER_DISPLAY = `o.order_code,o.status,o.payment_status,o.payment_method,o.total,o.delivery_fee,
  o.delivery_address,o.delivery_street,o.delivery_building,o.delivery_lat,o.delivery_lng,o.contact_phone,o.created_at,
  o.merchant_id,o.customer_id,m.name AS merchant_name,m.address AS merchant_address,m.street AS merchant_street,
  m.building_number AS merchant_building_number,m.lat AS merchant_lat,m.lng AS merchant_lng,
  c.full_name AS customer_name,c.mobile_number AS customer_mobile,c.whatsapp_number AS customer_whatsapp`;
async function deliveryRows(kind, {driverId = null, open = false, statuses = [], limit = 30} = {}) {
  const source = VERTICALS[kind];
  const values = [];
  const where = [];
  if (open) {
    where.push("d.status='open'", 'd.driver_id IS NULL');
    values.push(statuses); where.push(`o.status=ANY($${values.length}::text[])`);
  } else {
    values.push(driverId); where.push(`d.driver_id=$${values.length}`);
  }
  values.push(limit);
  const result = await database.query(
    `SELECT d.id,d.status AS delivery_status,d.delivered_at,d.pickup_photo_path,d.delivery_photo_path,
       ${ORDER_DISPLAY}
      FROM public.${source.deliveries} d JOIN public.${source.orders} o ON o.id=d.order_id
      LEFT JOIN public.merchants m ON m.id=o.merchant_id
      LEFT JOIN public.profiles c ON c.id=o.customer_id
      WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC LIMIT $${values.length}`,
    values,
  );
  return result.rows.map((r) => ({
    id:r.id,status:r.delivery_status,delivered_at:r.delivered_at,pickup_photo_path:r.pickup_photo_path,
    delivery_photo_path:r.delivery_photo_path,
    orders:{order_code:r.order_code,status:r.status,payment_status:r.payment_status,payment_method:r.payment_method,
      total:r.total,delivery_fee:r.delivery_fee,delivery_address:r.delivery_address,delivery_street:r.delivery_street,
      delivery_building:r.delivery_building,delivery_lat:r.delivery_lat,delivery_lng:r.delivery_lng,
      contact_phone:r.contact_phone,created_at:r.created_at,merchant_id:r.merchant_id,customer_id:r.customer_id,
      merchants:r.merchant_name ? {name:r.merchant_name,address:r.merchant_address,street:r.merchant_street,
        building_number:r.merchant_building_number,lat:r.merchant_lat,lng:r.merchant_lng}:null,
      profiles:r.customer_name ? {full_name:r.customer_name,mobile_number:r.customer_mobile,whatsapp_number:r.customer_whatsapp}:null},
  }));
}
async function orderByCode(kind, code) {
  const source=VERTICALS[kind];
  const customerColumn=kind==='ride'?'o.user_id AS customer_id':'o.customer_id';
  const result=await database.query(`SELECT o.id,o.${source.code} AS order_code,o.status,o.merchant_id,
      ${customerColumn},o.total,o.subtotal,o.platform_margin_total,o.delivery_fee,o.driver_fee,o.vat_amount,
      o.payment_status,o.payment_method,o.delivery_lat,o.delivery_lng,m.lat AS merchant_lat,m.lng AS merchant_lng
    FROM public.${source.orders} o LEFT JOIN public.merchants m ON m.id=o.merchant_id
    WHERE o.${source.code}=$1`,[code]);
  return result.rows[0] || null;
}
async function deliveryByOrder(kind, orderId) {
  const result=await database.query(`SELECT id,driver_id,status FROM public.${VERTICALS[kind].deliveries}
    WHERE order_id=$1`,[orderId]);
  return result.rows[0] || null;
}
async function rideByCode(code) {
  const result=await database.query(`SELECT id,booking_code,assigned_driver_id,driver_ride_status
    FROM public.bookings WHERE booking_code=$1`,[code]);
  return result.rows[0] || null;
}
async function setDeliveryStatus({kind,orderId,expectedStatus,orderStatus,deliveryId,driverId,deliveryStatus,photoColumn,photoPath,at}) {
  if (!['pickup_photo_path','delivery_photo_path'].includes(photoColumn)) throw new Error('Invalid delivery photo column');
  return database.transaction(async (client) => {
    const source=VERTICALS[kind];
    const delivered=orderStatus==='delivered';
    const updated=await client.query(`UPDATE public.${source.orders} SET status=$1${delivered?',delivered_at=$2':''}
      WHERE id=$${delivered?4:3} AND status=$${delivered?3:2} RETURNING ${source.code} AS order_code`,
      delivered?[orderStatus,at,expectedStatus,orderId]:[orderStatus,expectedStatus,orderId]);
    if (!updated.rowCount) return null;
    const delivery=await client.query(`UPDATE public.${source.deliveries} SET status=$1,${photoColumn}=$2,
        ${deliveryStatus==='picked_up'?'picked_up_at=$3':'delivered_at=$3'}
      WHERE id=$4 AND driver_id=$5`,[deliveryStatus,photoPath,at,deliveryId,driverId]);
    if (!delivery.rowCount) throw new Error('Delivery assignment changed while advancing status');
    return updated.rows[0];
  });
}

module.exports = {
  listOffers,driverCashProfile,driverProfile,claimDelivery,ridePaymentMethod,claimRide,
  acceptOffer,orderById,cancelOffer,bookingCodeById,declineOffer,deliveryRows,orderByCode,
  deliveryByOrder,rideByCode,setDeliveryStatus,
};
