'use strict';

const database = require('../lib/database/pool');

const CREATED_FIELDS = [
  'user_id','trip_type','airport_terminal','pickup_address','pickup_lat','pickup_lng',
  'pickup_street','pickup_building','dropoff_address','dropoff_lat','dropoff_lng',
  'dropoff_street','dropoff_building','pickup_datetime','passenger_count','luggage_count',
  'notes','passenger_name','passenger_mobile','passenger_whatsapp','passenger_email',
  'fare_amount','distance_km','distance_surcharge','vat_amount','vat_rate','total_amount',
  'currency','payment_method','booking_status',
];
const RETURN_COLUMNS = `id, booking_code, fare_amount, vat_amount, vat_rate, total_amount,
  currency, booking_status, payment_status, payment_method`;

async function create(input) {
  const fields = CREATED_FIELDS.filter((field) => Object.hasOwn(input, field));
  const values = fields.map((field) => input[field]);
  const placeholders = fields.map((_, index) => `$${index + 1}`);
  const result = await database.query(
    `INSERT INTO public.bookings (${fields.join(',')}) VALUES (${placeholders.join(',')})
     RETURNING ${RETURN_COLUMNS}`,
    values,
  );
  return result.rows[0];
}

async function listForUser(userId, limit = 50) {
  const result = await database.query(
    `SELECT booking_code, trip_type, airport_terminal, pickup_address, dropoff_address,
            pickup_street, pickup_building, dropoff_street, dropoff_building,
            pickup_datetime, fare_amount, vat_amount, vat_rate, total_amount, currency,
            payment_status, payment_method, booking_status, driver_ride_status, created_at
       FROM public.bookings WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [userId, limit],
  );
  return result.rows;
}

async function byCode(code) {
  const result = await database.query(
    `SELECT booking_code, trip_type, airport_terminal, pickup_address, dropoff_address,
            pickup_street, pickup_building, dropoff_street, dropoff_building,
            pickup_datetime, fare_amount, vat_amount, vat_rate, total_amount, currency,
            payment_status, booking_status
       FROM public.bookings WHERE booking_code=$1`, [code],
  );
  return result.rows[0] || null;
}

async function cancellationDetails(code) {
  const result = await database.query(
    `SELECT id, booking_code, booking_status, assigned_driver_id, user_id
       FROM public.bookings WHERE booking_code=$1`, [code],
  );
  return result.rows[0] || null;
}

async function cancel({ id, statuses }) {
  const result = await database.query(
    `UPDATE public.bookings SET booking_status='cancelled',
            driver_ride_status=CASE WHEN assigned_driver_id IS NOT NULL THEN 'cancelled' ELSE NULL END
      WHERE id=$1 AND booking_status=ANY($2::text[])
      RETURNING booking_code, booking_status`, [id, statuses],
  );
  return result.rows[0] || null;
}

async function contactDetails(code) {
  const result = await database.query(
    `SELECT id, booking_code, booking_status, user_id FROM public.bookings WHERE booking_code=$1`, [code],
  );
  return result.rows[0] || null;
}

async function updateContact({ booking, userId, isAdmin, statuses, patch }) {
  const columns = Object.keys(patch).filter((column) => ['passenger_mobile','passenger_whatsapp'].includes(column));
  if (!columns.length) return null;
  const values = columns.map((column) => patch[column]);
  const setClause = columns.map((column, index) => `${column}=$${index + 1}`).join(',');
  const idParam = values.length + 1;
  const ownerParam = values.length + 2;
  const statusesParam = values.length + 4;
  const result = await database.query(
    `UPDATE public.bookings SET ${setClause}
      WHERE id=$${idParam} AND ($${ownerParam}::boolean OR user_id=$${ownerParam + 1})
        AND booking_status=ANY($${statusesParam}::text[])
      RETURNING booking_code, passenger_mobile, passenger_whatsapp`,
    [...values, booking.id, isAdmin, userId, statuses],
  );
  return result.rows[0] || null;
}

module.exports = { create, listForUser, byCode, cancellationDetails, cancel, contactDetails, updateContact };
