'use strict';

const database = require('../lib/database/pool');

const JOB_COLUMNS = new Set(['order_id', 'booking_id', 'shop_order_id']);
const TABLES = new Set(['orders', 'shop_orders', 'bookings']);
const CODES = new Set(['order_code', 'booking_code']);

async function queryRows(sql, values = []) {
  const { rows } = await database.query(sql, values);
  return rows;
}

function requireChoice(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`Invalid dispatch ${label}`);
  return value;
}

function freshDriverLocations(since, limit = 500) {
  return queryRows(
    `SELECT driver_id,lat,lng,recorded_at,service_types FROM (
       SELECT dl.driver_id,dl.lat,dl.lng,dl.recorded_at,p.service_types,
         row_number() OVER (PARTITION BY dl.driver_id ORDER BY dl.recorded_at DESC) AS rn
       FROM public.driver_locations dl JOIN public.profiles p ON p.id=dl.driver_id
       WHERE dl.recorded_at >= $1 AND p.role='driver' AND p.driver_approved=true
     ) latest WHERE rn=1 ORDER BY recorded_at DESC LIMIT $2`, [since,limit]);
}

async function offeredDriverIds(column, targetId) {
  requireChoice(column, JOB_COLUMNS, 'job column');
  const rows = await queryRows(`SELECT driver_id FROM public.dispatch_offers WHERE ${column}=$1`, [targetId]);
  return rows.map((row) => row.driver_id);
}

async function busyDriverIds() {
  const rows = await queryRows("SELECT DISTINCT driver_id FROM public.dispatch_offers WHERE status='pending'");
  return rows.map((row) => row.driver_id);
}

async function loadFoodTarget(id) {
  const rows = await queryRows(
    `SELECT o.id,o.order_code,o.status,o.payment_status,o.payment_method,o.merchant_id,
     m.lat AS merchant_lat,m.lng AS merchant_lng,m.name AS merchant_name,m.address AS merchant_address
     FROM public.orders o LEFT JOIN public.merchants m ON m.id=o.merchant_id WHERE o.id=$1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function loadShopTarget(id) {
  const rows = await queryRows(
    `SELECT o.id,o.order_code,o.status,o.payment_status,o.payment_method,o.merchant_id,
     m.lat AS merchant_lat,m.lng AS merchant_lng,m.name AS merchant_name,m.address AS merchant_address
     FROM public.shop_orders o LEFT JOIN public.merchants m ON m.id=o.merchant_id WHERE o.id=$1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function loadRideTarget(id) {
  const rows = await queryRows(
    `SELECT id,booking_code,booking_status,assigned_driver_id,pickup_address,pickup_lat,pickup_lng,
     dropoff_address,dropoff_lat,dropoff_lng,trip_type,airport_terminal,pickup_datetime,
     fare_amount,currency,payment_method FROM public.bookings WHERE id=$1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function overCashCapDriverIds(limit) {
  const rows = await queryRows('SELECT id FROM public.profiles WHERE cash_owed >= $1', [limit]);
  return rows.map((row) => row.id);
}

async function setDeliveryOpen(kind, id) {
  const table = kind === 'food' ? 'deliveries' : kind === 'shop' ? 'shop_deliveries' : null;
  if (!table) throw new Error('Invalid dispatch delivery kind');
  await database.query(`UPDATE public.${table} SET status='open' WHERE order_id=$1 AND driver_id IS NULL`, [id]);
}

async function createOffer({ jobColumn, targetId, driverId, round, distanceKm, expiresAt }) {
  requireChoice(jobColumn, JOB_COLUMNS, 'job column');
  const rows = await queryRows(
    `INSERT INTO public.dispatch_offers(${jobColumn},driver_id,round,distance_km,expires_at)
     VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at`,
    [targetId,driverId,round,distanceKm,expiresAt]);
  return rows[0] || null;
}

async function getDelivery(kind, orderId) {
  const table = kind === 'food' ? 'deliveries' : kind === 'shop' ? 'shop_deliveries' : null;
  if (!table) throw new Error('Invalid dispatch delivery kind');
  const rows = await queryRows(`SELECT id,driver_id,status FROM public.${table} WHERE order_id=$1 LIMIT 1`, [orderId]);
  return rows[0] || null;
}

async function createDelivery(kind, orderId) {
  const table = kind === 'food' ? 'deliveries' : kind === 'shop' ? 'shop_deliveries' : null;
  if (!table) throw new Error('Invalid dispatch delivery kind');
  await database.query(`INSERT INTO public.${table}(order_id,status) VALUES($1,'searching')`, [orderId]);
}

async function releaseDelivery(kind, orderId, status = 'searching') {
  const table = kind === 'food' ? 'deliveries' : kind === 'shop' ? 'shop_deliveries' : null;
  if (!table) throw new Error('Invalid dispatch delivery kind');
  const rows = await queryRows(
    `UPDATE public.${table} SET driver_id=NULL,status=$2 WHERE order_id=$1 AND status='assigned' RETURNING id`,
    [orderId,status]);
  return rows.length > 0;
}

async function loadOrderSummary(kind, id) {
  const table = kind === 'food' ? 'orders' : kind === 'shop' ? 'shop_orders' : null;
  if (!table) throw new Error('Invalid dispatch order kind');
  const rows = await queryRows(
    `SELECT order_code,customer_id,merchant_id,status FROM public.${table} WHERE id=$1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function abandonedDeliveries(kind, statuses) {
  const table = kind === 'food' ? 'deliveries' : kind === 'shop' ? 'shop_deliveries' : null;
  const orderTable = kind === 'food' ? 'orders' : kind === 'shop' ? 'shop_orders' : null;
  if (!table || !orderTable) throw new Error('Invalid dispatch delivery kind');
  return queryRows(
    `SELECT d.order_id,d.driver_id FROM public.${table} d JOIN public.${orderTable} o ON o.id=d.order_id
     WHERE d.status='assigned' AND d.driver_id IS NOT NULL AND o.status=ANY($1::text[])`, [statuses]);
}

async function latestLocation(driverId) {
  const rows = await queryRows(
    'SELECT recorded_at FROM public.driver_locations WHERE driver_id=$1 ORDER BY recorded_at DESC LIMIT 1',
    [driverId]);
  return rows[0] || null;
}

async function staleShopOrders(status, cutoff, { excludeCash = false } = {}) {
  if (status !== 'pending' && status !== 'accepted') throw new Error('Invalid stale shop order status');
  const rows = await queryRows(
    `SELECT id,order_code,customer_id,merchant_id FROM public.shop_orders
     WHERE status=$1 AND payment_status='awaiting' AND created_at<$2
     AND (NOT $3::boolean OR payment_method<>'cash') LIMIT 200`, [status,cutoff,excludeCash]);
  return rows;
}

async function cancelUnpaidShopOrder(id) {
  const rows = await queryRows(
    `UPDATE public.shop_orders SET status='cancelled',reject_reason='payment_timeout'
     WHERE id=$1 AND status=ANY($2::text[]) AND payment_status='awaiting' RETURNING order_code`,
    [id,['pending','accepted']]);
  return rows.length > 0;
}

async function releaseRide(id, driverId) {
  const rows = await queryRows(
    `UPDATE public.bookings SET assigned_driver_id=NULL,driver_ride_status=NULL,booking_status='confirmed'
     WHERE id=$1 AND assigned_driver_id=$2 AND driver_ride_status=ANY($3::text[])
     RETURNING id,booking_code,user_id`, [id,driverId,['accepted','on_the_way','arrived']]);
  return rows[0] || null;
}

async function abandonedRides() {
  return queryRows(
    `SELECT id,assigned_driver_id FROM public.bookings WHERE assigned_driver_id IS NOT NULL
     AND driver_ride_status=ANY($1::text[])`, [['on_the_way','arrived']]);
}

async function expireOffers(now) {
  return queryRows(
    `UPDATE public.dispatch_offers SET status='expired',responded_at=$1
     WHERE status='pending' AND expires_at<$1
     RETURNING id,order_id,booking_id,shop_order_id,driver_id`, [now]);
}

async function unconfirmedCharges(source, newest, oldest, limit) {
  requireChoice(source.table, TABLES, 'source table');
  requireChoice(source.code, CODES, 'code column');
  return queryRows(
    `SELECT ${source.code},gateway_charge_id FROM public.${source.table}
     WHERE gateway_charge_id IS NOT NULL AND created_at<$1 AND created_at>$2
     AND payment_status=ANY($3::text[]) ORDER BY created_at LIMIT $4`,
    [newest,oldest,source.paymentStates,limit]);
}

module.exports = {
  freshDriverLocations, offeredDriverIds, busyDriverIds,
  loadFoodTarget, loadShopTarget, loadRideTarget, overCashCapDriverIds,
  setDeliveryOpen, createOffer, getDelivery, createDelivery, releaseDelivery,
  loadOrderSummary, abandonedDeliveries, latestLocation, staleShopOrders,
  cancelUnpaidShopOrder, releaseRide, abandonedRides, expireOffers, unconfirmedCharges,
};
