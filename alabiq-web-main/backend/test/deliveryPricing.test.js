require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const { surchargeFor, exceedsMaxRadius, deliveryTerms } = require('../lib/deliveryPricing');

test('the first 15 km carry no surcharge', () => {
  assert.equal(surchargeFor(0).surcharge, 0);
  assert.equal(surchargeFor(14.99).surcharge, 0);
  // The free band is inclusive: 15.0 exactly is still free.
  assert.equal(surchargeFor(15).surcharge, 0);
});

test('only the kilometres past the free band are charged', () => {
  const twenty = surchargeFor(20);
  assert.equal(twenty.chargeableKm, 5);
  assert.equal(twenty.surcharge, 1.25);
  // Just over the band: the first metre past 15 km costs, but almost nothing.
  assert.equal(surchargeFor(15.5).surcharge, 0.13); // 0.125 rounded half-up
});

test('the chargeable distance is rounded to 2dp before it is priced', () => {
  // The receipt has to show a distance a human can multiply by 0.25 and get
  // the charged figure back.
  const q = surchargeFor(23.456789);
  assert.equal(q.chargeableKm, 8.46);
  assert.equal(q.surcharge, 2.12); // 2.115 rounded half-up
});

test('an unknown distance is never guessed at', () => {
  // distanceKm is null whenever either endpoint has no coordinates.
  for (const distance of [null, undefined, NaN, 'abc']) {
    assert.equal(surchargeFor(distance).surcharge, 0, `surchargeFor(${String(distance)})`);
  }
});

test('the terms come back with the surcharge so a caller cannot price it alone', () => {
  const { freeRadiusKm, perKm } = surchargeFor(20);
  assert.equal(freeRadiusKm, 15);
  assert.equal(perKm, 0.25);
});

test('the 50 km cap refuses only what is past it', () => {
  assert.equal(exceedsMaxRadius(49.99), false);
  assert.equal(exceedsMaxRadius(50), false, 'the cap is exclusive: 50 km exactly is still served');
  assert.equal(exceedsMaxRadius(50.01), true);
});

test('a missing distance is not treated as too far', () => {
  // Refusing on missing data would break checkout for every merchant without
  // a pin. We cannot prove the leg is too long, so we do not claim it.
  for (const distance of [null, undefined, NaN, 'abc']) {
    assert.equal(exceedsMaxRadius(distance), false, `exceedsMaxRadius(${String(distance)})`);
  }
});

test('an explicit limit overrides the configured one', () => {
  // How the admin-set max_distance_km (0043) reaches this rule: the caller
  // resolves it from lib/settings.js and passes it in, so the same function
  // serves rides and deliveries without either reading the database.
  assert.equal(exceedsMaxRadius(30, 30), false, 'the cap stays exclusive when passed in');
  assert.equal(exceedsMaxRadius(30.01, 30), true);
  assert.equal(exceedsMaxRadius(80, 30), true);
  // Higher than the env default: what the default alone would refuse now passes.
  assert.equal(exceedsMaxRadius(80, 200), false);
});

test('a null limit means no limit, not zero', () => {
  // This is the state the platform ships in after 0043, and it is what
  // "tangal limit" actually resolves to. Reading null as 0 here would
  // refuse every booking on the platform, so it is worth pinning.
  assert.equal(exceedsMaxRadius(10, null), false);
  assert.equal(exceedsMaxRadius(5000, null), false);
});

test('storefront cards get the terms, not a bare fee they would show as final', () => {
  // Discovery pages have no delivery address, so the honest number is a floor
  // plus the rule. Shipping the base fee alone made every card read as the
  // final price while checkout was quietly adding per-km on top.
  assert.deepEqual(deliveryTerms(10), {
    baseFee: 10,
    freeRadiusKm: 15,
    surchargePerKm: 0.25,
    maxRadiusKm: 50,
  });
});
