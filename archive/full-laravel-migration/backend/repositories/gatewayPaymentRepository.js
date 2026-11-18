'use strict';

const database = require('../lib/database/pool');
const TABLES = Object.freeze({
  ride: { table: 'bookings', code: 'booking_code' },
  food: { table: 'orders', code: 'order_code' },
  shop: { table: 'shop_orders', code: 'order_code' },
});

async function recordChargeStart(vertical, code, chargeId) {
  const source = TABLES[vertical];
  if (!source) throw new Error('Unknown payment vertical');
  const result = await database.query(
    `UPDATE public.${source.table} SET gateway_charge_id=$1 WHERE ${source.code}=$2`,
    [chargeId, code],
  );
  return result.rowCount > 0;
}

async function findByChargeId(vertical, chargeId) {
  const source = TABLES[vertical];
  const result = await database.query(
    `SELECT ${source.code} AS code FROM public.${source.table} WHERE gateway_charge_id=$1 LIMIT 1`,
    [chargeId],
  );
  return result.rows[0] || null;
}

async function markFailed(vertical, code) {
  const source = TABLES[vertical];
  if (!source) return;
  const isRide = vertical === 'ride';
  await database.query(
    `UPDATE public.${source.table} SET payment_status=$1
      WHERE ${source.code}=$2 AND payment_status = ANY($3::text[])`,
    [isRide ? 'rejected' : 'failed', code,
      isRide ? ['awaiting_proof', 'proof_uploaded', 'under_review'] : ['awaiting']],
  );
}

async function rideByCode(code) {
  const result = await database.query(
    `SELECT id, booking_code, user_id AS customer_id, fare_amount, vat_amount,
            vat_rate, total_amount, currency, payment_method, payment_status, booking_status
       FROM public.bookings WHERE booking_code=$1`, [code],
  );
  return result.rows[0] || null;
}

async function cardBookingByCode(code) {
  const result = await database.query(
    `SELECT id,booking_code,user_id AS customer_id,fare_amount,vat_amount,total_amount,
            currency,payment_method,payment_status FROM public.bookings WHERE booking_code=$1`, [code],
  );
  return result.rows[0] || null;
}

module.exports = { recordChargeStart, findByChargeId, markFailed, rideByCode, cardBookingByCode };
