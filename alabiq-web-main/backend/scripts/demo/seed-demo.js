// DEMO-ONLY — a ride already in progress, for the live-tracking screen.
//   npm run seed:demo  ->  open the printed /track/<code> URL
const {
  insertRow, insertRows, DROPOFF, DRIVER_AT, DEMO_DRIVER, frontendBase, ensureDemoDriver, demoBooking,
} = require('./_demo-lib');

async function run() {
  const driverId = await ensureDemoDriver();
  const now = Date.now();

  const booking = await insertRow('bookings', demoBooking({
    payment_status: 'verified',
    booking_status: 'driver_on_the_way',
    verification_mode: 'test_auto',
    confirmed_at: new Date(now).toISOString(),
    assigned_driver_id: driverId,
    driver_ride_status: 'on_the_way',
  }));

  // Fresh GPS ping so the map shows the car + a live ETA.
  await insertRow('driver_locations', {
    driver_id: driverId, lat: DRIVER_AT.lat, lng: DRIVER_AT.lng, accuracy_meters: 12,
  });

  // A believable timeline.
  const ev = (mins, event_type, title, message) => ({
    booking_id: booking.id, event_type, title, message,
    created_at: new Date(now - mins * 60000).toISOString(),
  });
  await insertRows('tracking_events', [
    ev(12, 'booking_created', 'Booking created', 'Your booking has been created. Please continue to payment.'),
    ev(10, 'proof_uploaded', 'Payment proof uploaded', 'We received your payment proof. It is now under review.'),
    ev(9, 'payment_verified', 'Payment verified', 'Your payment has been verified. Your booking is confirmed.'),
    ev(5, 'driver_accepted', 'Driver accepted', 'Ahmed accepted your trip and is on the way.'),
    ev(1, 'driver_on_the_way', 'Driver on the way', 'Your driver is on the way to your pickup.'),
  ]);

  console.log('\n✅ Demo ride in progress');
  console.log(`   Tracking URL : ${frontendBase()}/track/${booking.booking_code}`);
  console.log(`   Demo driver  : ${DEMO_DRIVER.email} / ${DEMO_DRIVER.password} (approved)\n`);
}

run().catch((e) => { console.error('seed-demo failed:', e.message || e); process.exit(1); });
