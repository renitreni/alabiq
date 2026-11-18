// DEMO-ONLY — a paid, confirmed ride with NO driver yet, so it shows up in
// the driver's "nearby requests" feed for a live accept during the demo.
//   npm run seed:request  ->  driver goes online at /driver and taps Accept
const { insertRow, insertRows, DEMO_DRIVER, frontendBase, demoBooking } = require('./_demo-lib');

async function run() {
  const now = Date.now();

  const booking = await insertRow('bookings', demoBooking({
    payment_status: 'verified',
    booking_status: 'confirmed',          // verified + confirmed + unassigned = appears in the feed
    verification_mode: 'test_auto',
    confirmed_at: new Date(now).toISOString(),
    // assigned_driver_id intentionally left null
  }));

  const ev = (mins, event_type, title, message) => ({
    booking_id: booking.id, event_type, title, message,
    created_at: new Date(now - mins * 60000).toISOString(),
  });
  await insertRows('tracking_events', [
    ev(3, 'booking_created', 'Booking created', 'Your booking has been created. Please continue to payment.'),
    ev(2, 'proof_uploaded', 'Payment proof uploaded', 'We received your payment proof. It is now under review.'),
    ev(1, 'payment_verified', 'Payment verified', 'Your payment has been verified. Finding you a driver…'),
  ]);

  const base = frontendBase();
  console.log('\n✅ Open ride request ready (waiting for a driver)');
  console.log(`   Rider watches : ${base}/track/${booking.booking_code}`);
  console.log(`   Driver accepts: ${base}/driver  (sign in as ${DEMO_DRIVER.email} / ${DEMO_DRIVER.password}, Go online)\n`);
}

run().catch((e) => { console.error('seed-request failed:', e.message || e); process.exit(1); });
