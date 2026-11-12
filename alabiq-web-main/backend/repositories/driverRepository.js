'use strict';

const database = require('../lib/database/pool');

async function availableRides() {
  const result = await database.query(`SELECT booking_code,trip_type,airport_terminal,pickup_address,pickup_street,
      pickup_building,pickup_lat,pickup_lng,dropoff_address,dropoff_street,dropoff_building,dropoff_lat,
      dropoff_lng,pickup_datetime,fare_amount,currency,payment_method,created_at
    FROM public.bookings WHERE (payment_status='verified' OR payment_method='cash')
      AND booking_status='confirmed' AND assigned_driver_id IS NULL ORDER BY created_at ASC`);
  return result.rows;
}

async function bookingByCode(code) {
  const result=await database.query(`SELECT id,booking_code,payment_status,payment_method,booking_status,
      assigned_driver_id,user_id,fare_amount,vat_amount,vat_rate,total_amount,currency,distance_surcharge,
      driver_ride_status,pickup_lat,pickup_lng,trip_type
    FROM public.bookings WHERE booking_code=$1`,[code]);
  return result.rows[0] || null;
}

async function claimRide(id, driverId) {
  const result=await database.query(`UPDATE public.bookings SET assigned_driver_id=$1,
      driver_ride_status='accepted',booking_status='driver_assigned'
    WHERE id=$2 AND assigned_driver_id IS NULL AND booking_status='confirmed'
      AND (payment_status='verified' OR payment_method='cash')
    RETURNING booking_code,booking_status,driver_ride_status`,[driverId,id]);
  return result.rows[0] || null;
}

async function profileContact(driverId) {
  const result=await database.query('SELECT full_name,whatsapp_number FROM public.profiles WHERE id=$1',[driverId]);
  return result.rows[0] || null;
}

async function activeRides(driverId) {
  const result=await database.query(`SELECT booking_code,pickup_lat,pickup_lng FROM public.bookings
    WHERE assigned_driver_id=$1 AND driver_ride_status=ANY($2::text[])`,[driverId,['accepted','on_the_way','arrived','started']]);
  return result.rows;
}

async function activeDeliveries(kind, driverId, statuses) {
  const tables={food:{delivery:'deliveries',order:'orders'},shop:{delivery:'shop_deliveries',order:'shop_orders'}};
  const source=tables[kind];
  const result=await database.query(`SELECT o.order_code,o.status,o.delivery_lat,o.delivery_lng
    FROM public.${source.delivery} d JOIN public.${source.order} o ON o.id=d.order_id
    WHERE d.driver_id=$1 AND o.status=ANY($2::text[])`,[driverId,statuses]);
  return result.rows;
}

async function listRides(driverId,status) {
  const values=[driverId];
  const clause=status ? (values.push(status),` AND driver_ride_status=$2`) : '';
  const result=await database.query(`SELECT booking_code,trip_type,airport_terminal,pickup_address,pickup_street,
      pickup_building,pickup_lat,pickup_lng,dropoff_address,dropoff_street,dropoff_building,dropoff_lat,
      dropoff_lng,pickup_datetime,passenger_name,passenger_mobile,passenger_whatsapp,fare_amount,currency,
      booking_status,driver_ride_status,created_at FROM public.bookings
    WHERE assigned_driver_id=$1${clause} ORDER BY pickup_datetime ASC`,values);
  return result.rows;
}

async function updateRideStatus({booking,driverId,status,bookingStatus}) {
  const result=await database.query(`UPDATE public.bookings SET driver_ride_status=$1,booking_status=$2
    WHERE id=$3 AND assigned_driver_id=$4 AND driver_ride_status=$5
    RETURNING booking_code,driver_ride_status,booking_status`,
    [status,bookingStatus,booking.id,driverId,booking.driver_ride_status]);
  return result.rows[0] || null;
}

async function cashProfile(driverId) {
  const result=await database.query('SELECT cash_owed,cash_owed_limit FROM public.profiles WHERE id=$1',[driverId]);
  return result.rows[0] || null;
}
async function cashLedger(driverId) {
  const result=await database.query(`SELECT type,amount,balance_after,note,created_at FROM public.driver_cash_ledger
    WHERE driver_id=$1 ORDER BY created_at DESC LIMIT 20`,[driverId]);
  return result.rows;
}
async function setServiceTypes(driverId,serviceTypes) {
  const result=await database.query('UPDATE public.profiles SET service_types=$1 WHERE id=$2 RETURNING service_types',[serviceTypes,driverId]);
  return result.rows[0] || null;
}

module.exports={availableRides,bookingByCode,claimRide,profileContact,activeRides,activeDeliveries,
  listRides,updateRideStatus,cashProfile,cashLedger,setServiceTypes};
