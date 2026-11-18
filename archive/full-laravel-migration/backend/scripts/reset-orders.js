// ---------------------------------------------------------------------
// Clear food and shop orders before launch.
//
//   node scripts/reset-orders.js            # report only, changes nothing
//   node scripts/reset-orders.js --confirm  # do it
//
// WHAT IT TOUCHES
//   orders, shop_orders          -> deleted, with their children (items,
//                                   payments, deliveries, dispatch offers)
//                                   via the on-delete-cascade already in
//                                   the schema.
//   merchants.credit_used        -> zeroed, and merchant_credit_ledger
//                                   cleared. The credit subsystem is
//                                   vestigial: markup is inside the list
//                                   price and collected once at checkout,
//                                   so a leftover balance is a number that
//                                   can only ever decay and confuses
//                                   whoever reads it.
//
// WHAT IT DOES NOT TOUCH
//   bookings (Pick & Drop rides), drivers, merchants themselves, menus,
//   products, and every account. Deliberate: this is a transaction reset,
//   not a factory reset.
//
// STOCK IS RESTORED FIRST. A shop order still holding a reservation has
// already had the units subtracted from the catalogue. Deleting the order
// row would strand them -- the catalogue would read short by exactly the
// amount of every unfulfilled order, forever, with nothing left to explain
// it. shop_release_stock is idempotent, so a re-run is harmless.
//
// DRIVER BALANCES ARE REPORTED, NOT CLEARED. profiles.cash_owed references
// these orders only through a text note, no foreign key, so a balance
// survives the delete and leaves a rider owing money for an order that no
// longer exists. That is a decision, not a cleanup, so this prints it and
// stops there.
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
  for (const t of ['orders', 'shop_orders', 'bookings', 'merchant_credit_ledger']) {
    before[t] = await countOf(t);
    console.log(`  ${t.padEnd(24)} ${before[t]}`);
  }

  const { rows: heldStock } = await database.query(
    `SELECT id, order_code FROM public.shop_orders
     WHERE stock_reserved_at IS NOT NULL AND stock_released_at IS NULL`,
  );

  const { rows: credits } = await database.query(
    `SELECT id, name, credit_used FROM public.merchants WHERE credit_used > 0`,
  );

  const { rows: owing } = await database.query(
    `SELECT id, full_name, cash_owed FROM public.profiles WHERE cash_owed > 0`,
  );

  console.log('\nSHOP ORDERS STILL HOLDING STOCK');
  if (!heldStock || !heldStock.length) console.log('  none');
  else heldStock.forEach((o) => console.log(`  ${o.order_code}`));

  console.log('\nMERCHANT CREDIT TO ZERO');
  if (!credits || !credits.length) console.log('  none');
  else credits.forEach((m) => console.log(`  ${(m.name || m.id).padEnd(28)} ${m.credit_used}`));

  console.log('\nDRIVER CASH OWED — NOT TOUCHED, READ THIS');
  if (!owing || !owing.length) console.log('  none');
  else {
    owing.forEach((d) => console.log(`  ${(d.full_name || d.id).padEnd(28)} ${d.cash_owed}`));
    console.log(
      '  ^ part of this may have been accrued against orders this script is\n' +
        '    about to delete; the rest comes from cash RIDES, which survive. The\n' +
        '    ledger cannot tell them apart from here — driver_cash_ledger.booking_id\n' +
        '    is a FK to bookings, so a food/shop charge only names the order in a\n' +
        '    text note. Left alone on purpose. Settle or zero by hand if these\n' +
        '    should not carry into launch.'
    );
  }

  console.log('\nBOOKINGS (rides) are NOT touched:', before.bookings);

  if (!confirmed) {
    console.log('\nDRY RUN. Nothing was changed. Re-run with --confirm to apply.');
    return;
  }

  console.log('\nAPPLYING');

  for (const order of heldStock || []) {
    const { rows } = await database.query(
      `SELECT public.shop_release_stock($1) AS released`, [order.id],
    );
    console.log(`  stock released  ${order.order_code}  ${JSON.stringify(rows[0].released)}`);
  }

  await deleteAll('shop_orders');
  console.log('  shop_orders deleted');
  await deleteAll('orders');
  console.log('  orders deleted');

  await deleteAll('merchant_credit_ledger');
  console.log('  merchant_credit_ledger cleared');

  await database.query(`UPDATE public.merchants SET credit_used = 0 WHERE credit_used > 0`);
  console.log('  merchants.credit_used zeroed');

  console.log('\nAFTER');
  for (const t of ['orders', 'shop_orders', 'bookings', 'merchant_credit_ledger']) {
    console.log(`  ${t.padEnd(24)} ${await countOf(t)}`);
  }
  console.log('\nRides, drivers, merchants, menus and accounts are unchanged.');
}

run().catch((err) => {
  console.error('\nFAILED:', err.message);
  console.error('Nothing further was attempted. Re-run the dry run to see current state.');
  process.exit(1);
});
