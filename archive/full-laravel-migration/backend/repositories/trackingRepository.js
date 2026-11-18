'use strict';

const database = require('../lib/database/pool');

async function bookingByCode(code) {
  const result = await database.query(
    `SELECT id, assigned_driver_id, booking_code, trip_type, airport_terminal,
            pickup_address, pickup_street, pickup_building, pickup_lat, pickup_lng,
            dropoff_address, dropoff_street, dropoff_building, dropoff_lat, dropoff_lng,
            pickup_datetime, fare_amount, currency, passenger_mobile, passenger_whatsapp,
            payment_method, payment_status, booking_status, verification_mode,
            driver_ride_status, confirmed_at, created_at
       FROM public.bookings WHERE booking_code=$1`, [code],
  );
  return result.rows[0] || null;
}

async function eventsForBooking(bookingId) {
  const result = await database.query(
    `SELECT event_type, title, message, created_at FROM public.tracking_events
      WHERE booking_id=$1 ORDER BY created_at ASC`, [bookingId],
  );
  return result.rows;
}

async function driverContact(driverId) {
  const result = await database.query(
    'SELECT full_name, whatsapp_number FROM public.profiles WHERE id=$1', [driverId],
  );
  return result.rows[0] || null;
}

module.exports = { bookingByCode, eventsForBooking, driverContact };
