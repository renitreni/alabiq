require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const { quoteFare, fareBreakdown, payableAmount, bookingVat, FARE_BASE, SERVICE_FEE_RATE } = require('../lib/fare');

test('the fare ladder is base 100 plus a 3.75 percent service fee, ex-VAT', () => {
  const quote = quoteFare({ distanceKm: null });
  assert.equal(quote.base, 100);
  assert.equal(quote.serviceFee, 3.75);
  // 103.75 is the figure stored in bookings.fare_amount and the ONLY base the
  // driver commission is computed from.
  assert.equal(quote.amount, 103.75);
  assert.equal(quote.currency, 'SAR');
});

test('the passenger pays the fare plus VAT on it', () => {
  const quote = quoteFare({ distanceKm: null });
  assert.equal(quote.vatAmount, 15.56); // 15% of 103.75 is 15.5625, half-up
  assert.equal(quote.totalAmount, 119.31);
});

test('the distance surcharge sits beside VAT: inside the total, outside the commission base', () => {
  // A 20 km trip, the worked example in the module header. Folding the
  // surcharge into `amount` would hand roughly 80% of it to the driver, which
  // is the opposite of the intent -- it is platform revenue.
  const quote = quoteFare({ distanceKm: 20 });
  assert.equal(quote.amount, 103.75, 'the commission base does not move with distance');
  assert.equal(quote.distanceSurcharge, 1.25);
  assert.equal(quote.vatAmount, 15.75); // VAT on 105.00: the extra km are taxable too
  assert.equal(quote.totalAmount, 120.75);
});

test('the service fee is charged on the base only, never on the surcharge', () => {
  const near = quoteFare({ distanceKm: 5 });
  const far = quoteFare({ distanceKm: 45 });
  assert.equal(near.serviceFee, far.serviceFee);
  assert.equal(far.serviceFee, FARE_BASE * SERVICE_FEE_RATE);
});

test('rides have no distance cap', () => {
  // exceedsMaxRadius is a delivery rule. A 400 km airport transfer is a
  // legitimate booking and refusing it would be a new restriction.
  const quote = quoteFare({ distanceKm: 400 });
  assert.equal(quote.distanceSurcharge, 96.25); // 385 chargeable km at 0.25
  assert.equal(quote.totalAmount, 230);
});

test('a ride with no coordinates is quoted at the flat fare, not refused', () => {
  assert.equal(quoteFare().distanceSurcharge, 0);
  assert.equal(quoteFare({}).amount, 103.75);
});

test('a stored fare breaks back down into exactly the base and fee that made it', () => {
  // Receipts and driver instructions derive this from the snapshot, so it has
  // to round-trip.
  assert.deepEqual(fareBreakdown(103.75), {
    base: 100,
    serviceFeeRate: 0.0375,
    serviceFee: 3.75,
    total: 103.75,
    currency: 'SAR',
  });
});

test('breaking down a TOTAL instead of a fare invents a base fare nobody was charged', () => {
  // Pinned as a trap, not as desired behaviour: the 1.0375 ratio only holds
  // for base + service fee. total_amount also carries VAT and the surcharge,
  // so passing it here silently produces a 116.39 base for a 100 SAR ride.
  assert.equal(fareBreakdown(120.75).base, 116.39);
  assert.notEqual(fareBreakdown(120.75).base, FARE_BASE);
});

test('the amount to charge or collect is the stored total, VAT included', () => {
  assert.equal(payableAmount({ fare_amount: 103.75, total_amount: 120.75 }), 120.75);
});

test('a booking created before VAT was stored falls back to the bare fare', () => {
  // Pre-0025 bookings genuinely had no VAT line; charging them a recomputed
  // one would bill a passenger for tax that was never agreed.
  assert.equal(payableAmount({ fare_amount: 103.75, total_amount: null }), 103.75);
  assert.equal(payableAmount({ fare_amount: 103.75, total_amount: 0 }), 103.75);
  assert.equal(payableAmount(null), 0);
});

test('VAT on a stored booking is read from the row, never recomputed', () => {
  assert.equal(bookingVat({ vat_amount: 15.75 }), 15.75);
  assert.equal(bookingVat({ vat_amount: null }), 0);
  assert.equal(bookingVat({}), 0);
  assert.equal(bookingVat(null), 0);
});
