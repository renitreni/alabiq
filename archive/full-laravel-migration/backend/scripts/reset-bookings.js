// ---------------------------------------------------------------------
// Clear Pick & Drop rides before launch.
//
//   node scripts/reset-bookings.js            # report only, changes nothing
//   node scripts/reset-bookings.js --confirm  # do it
//
// The companion to reset-orders.js, which clears food and shop but leaves
// rides standing on purpose. Together they zero the admin dashboard.
//
// WHAT IT TOUCHES
//   bookings  -> deleted, with the children the schema cascades:
//                payment_proofs, payments, tracking_events, ledger_entries,
//                dispatch_offers, driver_ratings.
//
// WHAT IT DOES NOT TOUCH
//   drivers, passengers, merchants, menus, products and every account.
//   webhook_events, notification_events and driver_cash_ledger survive the
//   delete with booking_id set to null -- that is the schema's choice, and
//   the right one for an audit trail.
//
// PROOF IMAGES ARE REPORTED, NOT DELETED. payment_proofs rows cascade away
// but the uploaded receipts stay in storage with nothing left pointing at
// them. Counted here so the bucket can be emptied deliberately.
//
// DRIVER BALANCES ARE REPORTED, NOT CLEARED, for the same reason as in
// reset-orders.js: cash_owed is a running total, not a sum this script can
// re-derive once the rides behind it are gone.
// ---------------------------------------------------------------------
require('dotenv').config();
const database = require('../lib/database/pool');

const confirmed = process.argv.includes('--confirm');

async function countOf(table) {
  const { rows } = await database.query(`SELECT count(*)::int AS count FROM public.${table}`);
  return rows[0].count;
}

async function deleteAll(table) {
  await database.query(`DELETE FROM public.${table}`);
}

async function run() {
  console.log('BEFORE');
  const before = {};
  for (const t of ['bookings', 'payment_proofs', 'payments', 'tracking_events', 'ledger_entries']) {
    before[t] = await countOf(t);
    console.log(`  ${t.padEnd(24)} ${before[t]}`);
  }

  const { rows: rides } = await database.query(
    `SELECT booking_status, payment_status, fare_amount FROM public.bookings`,
  );

  const byStatus = {};
  let revenue = 0;
  for (const b of rides || []) {
    byStatus[b.booking_status] = (byStatus[b.booking_status] || 0) + 1;
    if (b.payment_status === 'verified') revenue += Number(b.fare_amount) || 0;
  }

  console.log('\nWHAT THE DASHBOARD IS READING');
  Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => console.log(`  ${s.padEnd(24)} ${n}`));
  console.log(`  ${'verified revenue'.padEnd(24)} SAR ${Math.round(revenue * 100) / 100}`);

  const { rows: owing } = await database.query(
    `SELECT id, full_name, cash_owed FROM public.profiles WHERE cash_owed > 0`,
  );

  console.log('\nPAYMENT PROOF IMAGES LEFT IN STORAGE');
  console.log(`  ${before.payment_proofs} row(s) cascade away; their uploads do not. Empty the`);
  console.log('  bucket by hand if these should not carry into launch.');

  console.log('\nDRIVER CASH OWED — NOT TOUCHED, READ THIS');
  if (!owing || !owing.length) console.log('  none');
  else {
    owing.forEach((d) => console.log(`  ${(d.full_name || d.id).padEnd(28)} ${d.cash_owed}`));
    console.log('  ^ accrued against rides this script is about to delete, and possibly');
    console.log('    against food/shop orders too. Settle or zero by hand.');
  }

  if (!confirmed) {
    console.log('\nDRY RUN. Nothing was changed. Re-run with --confirm to apply.');
    return;
  }

  console.log('\nAPPLYING');
  await deleteAll('bookings');
  console.log('  bookings deleted (children cascaded)');

  console.log('\nAFTER');
  for (const t of ['bookings', 'payment_proofs', 'payments', 'tracking_events', 'ledger_entries']) {
    console.log(`  ${t.padEnd(24)} ${await countOf(t)}`);
  }
  console.log('\nDrivers, passengers, merchants, menus and accounts are unchanged.');
}

run().catch((err) => {
  console.error('\nFAILED:', err.message);
  console.error('Nothing further was attempted. Re-run the dry run to see current state.');
  process.exit(1);
});
