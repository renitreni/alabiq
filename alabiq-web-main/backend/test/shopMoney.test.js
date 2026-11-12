require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  markupPerUnit,
  resolveUnitPricing,
  availabilityBand,
  priceShopOrder,
} = require('../lib/shopMoney');

const product = (unitPrice, quantity = 1, extra = {}) => ({
  productId: 'p-1',
  name: 'Product',
  unitPrice,
  quantity,
  ...extra,
});

// --- per-unit markup -------------------------------------------------

test('a product cheaper than the flat markup never costs the store more than it earned', () => {
  // Same defect as food, same fix: the fallback branch had nothing to compare
  // against, so a 1.99 product was billed the full 5.00 default markup.
  assert.equal(markupPerUnit({ unitPrice: 1.99, netPrice: null }), 1.99);
});

test('a normally priced product still gives up exactly the flat 5 SAR markup', () => {
  assert.equal(markupPerUnit({ unitPrice: 60, netPrice: null }), 5);
  // Boundary: at exactly the markup both sides agree.
  assert.equal(markupPerUnit({ unitPrice: 5, netPrice: null }), 5);
});

test('the net-price branch is untouched by the clamp', () => {
  assert.equal(markupPerUnit({ unitPrice: 60, netPrice: 48 }), 12);
  assert.equal(markupPerUnit({ unitPrice: 1.99, netPrice: 1.5 }), 0.49);
  // Migration 0026 forbids net > list; the floor is defence in depth.
  assert.equal(markupPerUnit({ unitPrice: 10, netPrice: 12 }), 0);
});

test('food and shop agree on the clamp, so the two verticals cannot drift apart', () => {
  const food = require('../lib/foodMoney');
  // Both default margins are 5 SAR, so an identically priced cheap item must
  // produce an identical markup on either vertical.
  assert.equal(
    markupPerUnit({ unitPrice: 1.99, netPrice: null }),
    food.markupPerUnit({ unitPrice: 1.99, netPrice: null, itemType: 'meal_package' }),
  );
});

// --- variant pricing --------------------------------------------------

test('a variant overrides price and net price only where it sets them', () => {
  const base = { price: 60, net_price: 48 };
  assert.deepEqual(resolveUnitPricing(base, { price: 75, net_price: 60 }), { unitPrice: 75, netPrice: 60 });
  // null on the variant means inherit, not "no net price" -- inheriting wrong
  // here would hand the store the platform markup.
  assert.deepEqual(resolveUnitPricing(base, { price: 75, net_price: null }), { unitPrice: 75, netPrice: 48 });
  assert.deepEqual(resolveUnitPricing(base, null), { unitPrice: 60, netPrice: 48 });
  assert.deepEqual(resolveUnitPricing({ price: 60, net_price: null }, null), { unitPrice: 60, netPrice: null });
});

// --- stock disclosure -------------------------------------------------

test('the customer sees a band, never the exact stock count', () => {
  // Polled over time an exact count reveals a store's sales velocity per SKU,
  // which is why migration 0029 revokes the column from client roles.
  assert.equal(availabilityBand({ stock_quantity: 40 }, true), 'in_stock');
  assert.equal(availabilityBand({ stock_quantity: 5 }, true), 'low'); // default threshold, inclusive
  assert.equal(availabilityBand({ stock_quantity: 6 }, true), 'in_stock');
  assert.equal(availabilityBand({ stock_quantity: 0 }, true), 'out');
  assert.equal(availabilityBand({ stock_quantity: -3 }, true), 'out', 'a negative count is sold out, not available');
  // An untracked product is always sellable and reveals nothing at all.
  assert.equal(availabilityBand({ stock_quantity: 0 }, false), 'in_stock');
  assert.equal(availabilityBand(null, true), 'out');
});

// --- whole-order pricing ---------------------------------------------

test('a cheap-item shop order leaves the store square, never in debt', () => {
  const quote = priceShopOrder({ items: [product(1.99, 30)], distanceKm: null });
  assert.equal(quote.ok, true);
  assert.equal(quote.subtotal, 59.7);
  assert.equal(quote.marginTotal, 59.7);
  assert.equal(quote.subtotal - quote.marginTotal, 0);
});

test('shop VAT is 15 percent on the goods only -- the 15 SAR delivery fee is outside the base', () => {
  const quote = priceShopOrder({ items: [product(1.99, 30)], distanceKm: null });
  assert.equal(quote.baseDeliveryFee, 15);
  assert.equal(quote.vatAmount, 8.96); // 15% of 59.70 is 8.955, rounded half-up
  assert.equal(quote.total, 83.66);
});

test('shop mirrors food on the delivery split: driver 90 percent, platform 10', () => {
  const quote = priceShopOrder({ items: [product(1.99, 30)], distanceKm: null });
  assert.equal(quote.deliveryFee, 15);
  assert.equal(quote.driverFee, 13.5);
  assert.equal(quote.driverFeeRate, 0.9);
});

test('the shop minimum is 50 SAR ex-VAT, checked on the boundary', () => {
  const below = priceShopOrder({ items: [product(49.99)], distanceKm: null });
  assert.equal(below.ok, false);
  assert.equal(below.failureReason, 'min_order');
  assert.equal(below.shortfall, 0.01);
  assert.equal(priceShopOrder({ items: [product(50)], distanceKm: null }).ok, true);
});

test('shop deliveries share the one distance model with food and rides', () => {
  const quote = priceShopOrder({ items: [product(60)], distanceKm: 20 });
  assert.equal(quote.deliverySurcharge, 1.25); // 5 chargeable km at 0.25
  assert.equal(quote.deliveryFee, 16.25);
  const tooFar = priceShopOrder({ items: [product(60)], distanceKm: 50.01 });
  assert.equal(tooFar.failureReason, 'outside_radius');
});

test('a fractional quantity is truncated to whole units before pricing', () => {
  // Quantities arrive from a client. 2.9 units of something is not a thing we
  // can pack, and rounding up would charge for stock nobody picked.
  const quote = priceShopOrder({ items: [product(30, 2.9)], distanceKm: null });
  assert.equal(quote.lines[0].quantity, 2);
  assert.equal(quote.lines[0].lineTotal, 60);
});
