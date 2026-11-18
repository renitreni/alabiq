// DEMO-ONLY — an unpaid booking, for the payment screen.
//   npm run seed:pay  ->  open the printed /pay/<code> URL
const { insertRow, frontendBase, demoBooking } = require('./_demo-lib');

async function run() {
  // No status overrides -> falls back to the "awaiting payment" defaults.
  const booking = await insertRow('bookings', demoBooking());

  console.log('\n✅ Unpaid demo booking');
  console.log(`   Payment URL : ${frontendBase()}/pay/${booking.booking_code}\n`);
}

run().catch((e) => { console.error('seed-pay failed:', e.message || e); process.exit(1); });
