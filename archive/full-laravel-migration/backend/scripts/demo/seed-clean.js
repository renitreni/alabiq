// DEMO-ONLY — remove ALL demo data in one go.
//   npm run seed:clean
//
// Deletes every booking tagged DEMO_TAG (which cascades to its tracking
// events, proofs, payments, and ledger rows) and the demo driver account
// (which cascades to its profile + location pings). Real bookings, the
// admin account, and any real drivers are left untouched.
const { database, DEMO_TAG, DEMO_DRIVER, findUserByEmail } = require('./_demo-lib');

async function run() {
  // 1. Demo bookings (FK ON DELETE CASCADE handles their child rows).
  const { rows: removed } = await database.query(
    `DELETE FROM public.bookings WHERE notes=$1 RETURNING booking_code`, [DEMO_TAG],
  );
  console.log(`Removed ${removed ? removed.length : 0} demo booking(s).`);

  // 2. The demo driver account (cascades to profile + driver_locations).
  const driver = await findUserByEmail(DEMO_DRIVER.email);
  if (driver) {
    await database.query(`DELETE FROM public.app_users WHERE id=$1`, [driver.id]);
    console.log(`Removed demo driver ${DEMO_DRIVER.email}.`);
  } else {
    console.log('No demo driver to remove.');
  }

  // 3. Demo customer accounts (cascades to their profiles).
  const { rows: removedCustomers } = await database.query(
    `DELETE FROM public.app_users WHERE lower(email) LIKE 'demo.customer%@alabiq.com' RETURNING email`,
  );
  if (removedCustomers && removedCustomers.length) {
    console.log(`Removed ${removedCustomers.length} demo customer(s): ${removedCustomers.map((r) => r.email).join(', ')}`);
  } else {
    console.log('No demo customers to remove.');
  }

  console.log('\n✅ Demo data cleaned. Real data was left untouched.\n');
}

run().catch((e) => { console.error('seed-clean failed:', e.message || e); process.exit(1); });
