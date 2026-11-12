require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const { markupPerUnit, marginForItemType, priceOrder, creditAfterCharge, round2 } = require('../lib/foodMoney');

const meal = (unitPrice, quantity = 1, extra = {}) => ({
  menuItemId: 'mi-1',
  name: 'Meal',
  unitPrice,
  quantity,
  itemType: 'meal_package',
  ...extra,
});

// --- per-unit markup -------------------------------------------------

test('a cheap item never costs the merchant more than the line earned', () => {
  // Live row: BOTTLED WATER at 1.99 against the 3.00 drink_dessert_addon
  // margin. Unclamped this charged the merchant 3.00 for a line that brought
  // in 1.99, so subtotal - markup went negative with nothing rejecting it.
  const markup = markupPerUnit({ unitPrice: 1.99, netPrice: null, itemType: 'drink_dessert_addon' });
  assert.equal(markup, 1.99);
});

test('an item priced exactly at its flat margin leaves the merchant nothing, not a debt', () => {
  // The boundary the clamp turns on: at 3.00 both sides agree.
  assert.equal(markupPerUnit({ unitPrice: 3, netPrice: null, itemType: 'drink_dessert_addon' }), 3);
});

test('a normally priced meal still gives up exactly the flat 5 SAR margin', () => {
  // The clamp must not become a discount on the items priced above it.
  assert.equal(markupPerUnit({ unitPrice: 65, netPrice: null, itemType: 'meal_package' }), 5);
});

test('the net-price branch is untouched by the clamp', () => {
  // "X SAR (Y)" menus: markup is the gap, whatever the list price is.
  assert.equal(markupPerUnit({ unitPrice: 1.99, netPrice: 1.5, itemType: 'drink_dessert_addon' }), 0.49);
  assert.equal(markupPerUnit({ unitPrice: 65, netPrice: 55, itemType: 'meal_package' }), 10);
  // netPrice 0 is a real value, not "unset" -- the platform keeps the lot.
  assert.equal(markupPerUnit({ unitPrice: 1.99, netPrice: 0, itemType: 'meal_package' }), 1.99);
});

test('a net price above the list price yields no markup rather than a negative one', () => {
  // The DB CHECK in migration 0018 forbids this; the floor is defence in depth.
  assert.equal(markupPerUnit({ unitPrice: 10, netPrice: 12, itemType: 'meal_package' }), 0);
});

test('an unknown item_type is refused loudly instead of silently earning nothing', () => {
  assert.throws(
    () => marginForItemType('side_order'),
    /Unknown item_type/,
    'a new menu category must fail checkout, not quietly price at zero margin',
  );
});

// --- whole-order pricing ---------------------------------------------

test('a cheap-item order leaves the merchant square, never in debt', () => {
  // 20 bottles of water at 1.99. Before the clamp this charged 60.00 of
  // credit against a 39.80 line.
  const quote = priceOrder({
    items: [{ menuItemId: 'w', name: 'BOTTLED WATER', unitPrice: 1.99, quantity: 20, itemType: 'drink_dessert_addon' }],
    distanceKm: null,
  });
  assert.equal(quote.ok, true);
  assert.equal(quote.subtotal, 39.8);
  assert.equal(quote.marginTotal, 39.8);
  assert.equal(quote.subtotal - quote.marginTotal, 0, 'merchant payout is zero, and above all not negative');
});

test('VAT is 15 percent ADDED ON TOP of the goods, and the delivery fee is outside the base', () => {
  const quote = priceOrder({ items: [meal(65)], distanceKm: 5 });
  assert.equal(quote.subtotal, 65);
  assert.equal(quote.deliveryFee, 10);
  assert.equal(quote.vatRate, 0.15);
  // 15% of 65.00. Taxing the delivery too would make it 11.25 -- the
  // difference is what this test exists to pin.
  assert.equal(quote.vatAmount, 9.75);
  assert.equal(quote.total, 84.75);
  assert.ok(quote.total > quote.subtotal + quote.deliveryFee, 'tax-inclusive would leave the total unchanged');
});

test('VAT is computed once on the summed base, not per line', () => {
  // Per line the 15% figures are 7.58 + 4.52 = 12.10, but the tax owed on the
  // 80.60 base is 12.09. Per-line tax over-collects on mixed baskets.
  const quote = priceOrder({
    items: [meal(50.5), meal(30.1, 1, { menuItemId: 'mi-2' })],
    distanceKm: null,
  });
  assert.equal(quote.subtotal, 80.6);
  assert.equal(quote.vatAmount, 12.09);
  assert.equal(quote.total, 102.69);
});

test('the customer is never charged the platform markup', () => {
  // The margin is billed to merchant credit on accept. If it leaked into the
  // total the customer would pay it a second time.
  const quote = priceOrder({ items: [meal(65)], distanceKm: null });
  assert.equal(quote.marginTotal, 5);
  assert.equal(quote.total, quote.subtotal + quote.deliveryFee + quote.vatAmount);
});

test('the minimum order is judged on the ex-VAT subtotal', () => {
  // 29.99 plus 10 delivery plus VAT is 45.99 payable and it is still refused:
  // the 30 SAR floor is about the food, not about what we can bill.
  const quote = priceOrder({ items: [meal(29.99)], distanceKm: null });
  assert.equal(quote.ok, false);
  assert.equal(quote.failureReason, 'min_order');
  assert.equal(quote.shortfall, 0.01);
});

test('an order exactly at the minimum is accepted', () => {
  // The rule is >= 30, not > 30.
  assert.equal(priceOrder({ items: [meal(30)], distanceKm: null }).ok, true);
});

test('distance past the free radius is charged, not refused', () => {
  // 20 km is 5 chargeable km at 0.25.
  const quote = priceOrder({ items: [meal(65)], distanceKm: 20 });
  assert.equal(quote.ok, true);
  assert.equal(quote.baseDeliveryFee, 10);
  assert.equal(quote.deliverySurcharge, 1.25);
  assert.equal(quote.deliveryFee, 11.25);
  // The surcharge is inside deliveryFee, and delivery is outside the tax
  // base -- so distance never moves the VAT on a food order.
  assert.equal(quote.vatAmount, 9.75); // 15% of 65.00, same as at 5 km
});

test('the cut-off is the 50 km max radius, not the 15 km free band', () => {
  assert.equal(priceOrder({ items: [meal(65)], distanceKm: 50 }).ok, true, '50 km is inside the cap');
  const tooFar = priceOrder({ items: [meal(65)], distanceKm: 50.01 });
  assert.equal(tooFar.ok, false);
  assert.equal(tooFar.failureReason, 'outside_radius');
  assert.equal(tooFar.maxRadiusKm, 50);
});

test('an unknown distance charges the flat fee rather than guessing a surcharge', () => {
  // Merchants without a pin still have to be able to sell.
  const quote = priceOrder({ items: [meal(65)], distanceKm: null });
  assert.equal(quote.ok, true);
  assert.equal(quote.deliverySurcharge, 0);
  assert.equal(quote.deliveryFee, 10);
});

test('the minimum-order check runs before the radius check', () => {
  // Both fail here. Telling a customer to add 20 SAR when we cannot deliver
  // to them at all sends them shopping for nothing.
  const quote = priceOrder({ items: [meal(10)], distanceKm: 500 });
  assert.equal(quote.failureReason, 'min_order');
});

// --- merchant credit --------------------------------------------------

test('a merchant already at the credit limit cannot accept another order', () => {
  const state = creditAfterCharge({ credit_limit: 300, credit_used: 300 }, 5);
  assert.equal(state.canAccept, false);
  assert.equal(state.exhausted, true);
});

test('the 80 percent alert fires on the order that crosses it, and only that one', () => {
  const crossing = creditAfterCharge({ credit_limit: 300, credit_used: 238 }, 5); // 243 clears 240
  assert.equal(crossing.alertAt, 240);
  assert.equal(crossing.crossesAlert, true);
  const alreadyOver = creditAfterCharge({ credit_limit: 300, credit_used: 243 }, 5);
  assert.equal(alreadyOver.crossesAlert, false, 'the same merchant must not be alerted on every later order');
});

test('a merchant with no limit of its own falls back to the platform limit', () => {
  const state = creditAfterCharge({ credit_used: 0 }, 5);
  assert.equal(state.limit, 300);
  assert.equal(state.canAccept, true);
});

// --- the delivery fee split (migration 0041) -------------------------

test('the driver keeps 90 percent of the delivery fee and we keep 10', () => {
  const quote = priceOrder({ items: [meal(65)], distanceKm: null });
  assert.equal(quote.deliveryFee, 10);
  assert.equal(quote.driverFee, 9);
  assert.equal(quote.driverFeeRate, 0.9);
  // The two halves add back to the fee exactly. Rounding each side
  // independently is how a halala goes missing.
  assert.equal(round2(quote.deliveryFee - quote.driverFee), 1);
});

test('the distance surcharge is split with the driver too -- they drove it', () => {
  const quote = priceOrder({ items: [meal(65)], distanceKm: 20 });
  assert.equal(quote.deliveryFee, 11.25);
  assert.equal(quote.driverFee, 10.13); // 90% of 11.25 is 10.125, half-up
});

test('what a cash rider owes us is markup + VAT + our share of delivery, never their own share', () => {
  // The whole point of the 0041 change: before it, cash settlement took the
  // ENTIRE delivery fee back off the rider.
  const quote = priceOrder({ items: [meal(100, 1, { netPrice: 90 })], distanceKm: null });
  const owed = round2(
    quote.marginTotal + quote.vatAmount + round2(quote.deliveryFee - quote.driverFee)
  );
  assert.equal(quote.marginTotal, 10);
  assert.equal(quote.vatAmount, 15);
  assert.equal(quote.driverFee, 9);
  assert.equal(owed, 26);
  // And the rider is left holding exactly their fee out of what they collected.
  assert.equal(round2(quote.total - owed - (quote.subtotal - quote.marginTotal)), quote.driverFee);
});
