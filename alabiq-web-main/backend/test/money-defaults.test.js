const { MONEY_ENV_KEYS } = require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

// pureEnv.js clears the money knobs; these three are behaviour switches
// rather than prices, so they are cleared here instead. Same reason: a
// developer with them exported must get the same answer as CI.
for (const key of ['ADMIN_EMAILS', 'AUTO_VERIFY_STCPAY_TEST_MODE', 'TAP_ALLOW_NON_3DS_ON_FILE', 'SHOP_ENABLED']) {
  delete process.env[key];
}

const { config } = require('../lib/config');

// ---------------------------------------------------------------------
// The commercial terms of the platform, pinned as numbers.
//
// Every value below is a price the business agreed to, not an
// implementation detail: change one and real customers are charged
// differently. This file exists so that change is a deliberate act with a
// failing assertion attached, instead of a one-character edit in
// lib/config.js that nobody reviews.
//
// pureEnv.js has already deleted every override, so these are the DOCUMENTED
// defaults a fresh deployment with no .env would run on.
// ---------------------------------------------------------------------

test('no money knob is being read from the environment during tests', () => {
  // If this fails, a test elsewhere is asserting against a developer's shell
  // rather than against the documented defaults.
  const leaked = MONEY_ENV_KEYS.filter((k) => process.env[k] !== undefined);
  assert.deepEqual(leaked, []);
});

test('KSA VAT is 15 percent', () => {
  assert.equal(config.vat.rate, 0.15);
});

test('distance pricing is shared by all three services at 15 km free, 0.25 per km, 50 km cap', () => {
  assert.equal(config.delivery.freeRadiusKm, 15);
  assert.equal(config.delivery.surchargePerKm, 0.25);
  assert.equal(config.delivery.maxRadiusKm, 50);
  // The free band is not the cut-off: past 15 km we still deliver and charge,
  // only past 50 km do we refuse.
  assert.ok(config.delivery.freeRadiusKm < config.delivery.maxRadiusKm);
});

test('food delivery terms: 30 SAR minimum, 10 SAR promo fee, 5/3 SAR margins', () => {
  assert.equal(config.food.minOrderSar, 30);
  assert.equal(config.food.deliveryFeeSar, 10); // promo rate, first 3 months
  assert.equal(config.food.radiusKm, 15);
  assert.deepEqual(config.food.margins, { meal_package: 5, drink_dessert_addon: 3 });
});

test('shop terms: 50 SAR minimum, 15 SAR fee, 5 SAR fallback markup', () => {
  assert.equal(config.shop.minOrderSar, 50);
  assert.equal(config.shop.deliveryFeeSar, 15);
  assert.equal(config.shop.radiusKm, 15);
  assert.equal(config.shop.defaultMargin, 5);
  assert.equal(config.shop.lowStockThreshold, 5);
});

test('the shop vertical is OFF by default', () => {
  // The store, admin and rider halves do not exist yet. On, a customer can
  // pay for an order nobody can accept, and the checkout reserves stock with
  // no manual release path.
  assert.equal(config.shop.enabled, false);
});

test('there is ONE merchant credit model: 300 SAR limit, alert at 80 percent', () => {
  // config.shop deliberately has no copy of these -- both verticals charge the
  // same merchants.credit_limit / credit_used columns.
  assert.equal(config.food.merchantCreditLimit, 300);
  assert.equal(config.food.creditAlertPct, 0.8);
  assert.equal(config.shop.merchantCreditLimit, undefined);
  assert.equal(config.shop.creditAlertPct, undefined);
});

test('driver settlement: 20 percent commission, 500 SAR cash-owed cap, alert at 80 percent', () => {
  assert.equal(config.ledger.commissionRate, 0.2);
  assert.equal(config.ledger.manualPaymentFee, 0);
  // Must stay in sync with the profiles.cash_owed_limit column default
  // (migration 0022) -- the DB carries its own copy of this number.
  assert.equal(config.ledger.cashOwedLimit, 500);
  assert.equal(config.ledger.cashOwedAlertPct, 0.8);
});

test('opening hours are evaluated in Asia/Riyadh, not in the server timezone', () => {
  // Merchant hours are stored as wall-clock times; 09:00 means 09:00 in Saudi
  // whatever the host clock says. Saudi has no DST.
  assert.equal(config.platform.timezone, 'Asia/Riyadh');
});

test('delivery ETAs are floored at 45 minutes and shown as a 5-minute band', () => {
  // Google measures the road half only; a kitchen or packing bench sits in
  // front of it, so an unfloored 18-minute drive would promise 18 minutes.
  assert.equal(config.delivery.minEtaMinutes, 45);
  assert.equal(config.delivery.etaBandMinutes, 5);
});

test('test-mode and auto-approve style switches default to OFF', () => {
  // Pre-launch checklist: none of these may be on in production.
  assert.equal(config.autoVerifyTestMode, false);
  assert.equal(config.tap.allowNon3dsOnFile, false);
  assert.equal(config.adminEmails.length, 0, 'no admin email is compiled into the code');
});
