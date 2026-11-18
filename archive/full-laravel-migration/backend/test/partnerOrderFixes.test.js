'use strict';

const test = require('node:test');
const assert = require('node:assert');

// --- partnerRepository.createPartnerOrder ------------------------------------
// Verifies the review fixes: minor->SAR conversion on numeric(14,2) columns,
// driver fee/rate snapshot, quote compare-and-swap inside the transaction.

const pool = require('../lib/database/pool');

function makeClient(overrides = {}) {
  const calls = [];
  const client = {
    calls,
    queries: [],
    rolledBack: false,
    committed: false,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === 'BEGIN') return {};
      if (sql === 'COMMIT') { this.committed = true; return {}; }
      if (sql === 'ROLLBACK') { this.rolledBack = true; return {}; }
      if (sql.startsWith('INSERT INTO public.orders')) {
        return { rows: [{ id: 'ord-1', order_code: 'FD-TEST1', merchant_id: 'm-1', status: 'accepted', created_at: new Date() }] };
      }
      if (sql.startsWith('UPDATE public.delivery_quotes')) {
        return overrides.quoteConsumed === false ? { rows: [] } : { rows: [{ id: 'q-1' }] };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return client;
}

function baseArgs(overrides = {}) {
  return {
    merchantId: 'm-1',
    externalOrderId: 'ext-1',
    quoteId: 'q-1',
    customerName: 'Ali',
    customerPhone: '+966500000001',
    dropoffLat: 24.71,
    dropoffLng: 46.68,
    dropoffAddress: 'Riyadh',
    dropoffInstructions: null,
    items: [{ name: 'Meal', quantity: 2, unit_price_minor: 1250 }],
    merchandiseTotalMinor: 2500,
    merchandiseCurrency: 'SAR',
    externalPaymentStatus: 'paid',
    externalPaymentReference: null,
    preparationStatus: 'accepted',
    deliveryFeeMinor: 1000,
    driverFeeMinor: 900,
    driverFeeRate: 0.9,
    vatRate: 0.15,
    vatAmountMinor: 375,
    totalMinor: 3875,
    trackingTokenHash: 'ab'.repeat(32),
    trackingTokenExpiresAt: new Date(Date.now() + 86400000),
    distanceKm: 5.426,
    ...overrides,
  };
}

const partnerRepository = require('../repositories/partnerRepository');

test('createPartnerOrder stores SAR (not minor units) and snapshots driver fee/rate + distance', async () => {
  const client = makeClient();
  pool.connect = async () => client;

  await partnerRepository.createPartnerOrder(baseArgs());

  const insert = client.calls.find((c) => c.sql.startsWith('INSERT INTO public.orders'));
  assert.ok(insert, 'orders INSERT ran');
  const p = insert.params;
  // Numeric(14,2) SAR columns — a 25.00 SAR order must never store 2500.
  assert.strictEqual(p[10], 25);       // subtotal
  assert.strictEqual(p[11], 10);       // delivery_fee
  assert.strictEqual(p[13], 0);        // platform_margin_total (no food margin on partner orders)
  assert.strictEqual(p[15], 3.75);     // vat_amount
  assert.strictEqual(p[16], 38.75);    // total
  assert.strictEqual(p[17], 9);        // driver_fee snapshot
  assert.strictEqual(p[18], 0.9);      // driver_fee_rate snapshot
  assert.strictEqual(p[19], 5.43);     // distance_km rounded to 2dp
  assert.strictEqual(client.committed, true);
  assert.strictEqual(client.rolledBack, false);
});

test('createPartnerOrder rolls everything back when the quote is already consumed', async () => {
  const client = makeClient({ quoteConsumed: false });
  pool.connect = async () => client;

  await assert.rejects(
    () => partnerRepository.createPartnerOrder(baseArgs()),
    (err) => err.code === 'QUOTE_ALREADY_CONSUMED'
  );
  assert.strictEqual(client.committed, false);
  assert.strictEqual(client.rolledBack, true);
});

test('createPartnerOrder rejects item totals that disagree with merchandise_total', async () => {
  const client = makeClient();
  pool.connect = async () => client;

  await assert.rejects(
    () => partnerRepository.createPartnerOrder(baseArgs({
      items: [{ name: 'Meal', quantity: 1, unit_price_minor: 1 }],
    })),
    (err) => err.code === 'ITEM_TOTALS_MISMATCH'
  );
  assert.strictEqual(client.rolledBack, true);
});

// --- lib/partnerValidation.validatePartnerItems -------------------------------

const { validatePartnerItems } = require('../lib/partnerValidation');

test('validatePartnerItems accepts a consistent order', () => {
  assert.strictEqual(validatePartnerItems(
    [{ name: 'Meal', quantity: 2, unit_price_minor: 1250 }],
    { amount_minor: 2500, currency: 'SAR' }
  ), null);
});

test('validatePartnerItems tolerates a 1-minor-unit rounding drift', () => {
  assert.strictEqual(validatePartnerItems(
    [{ name: 'Meal', quantity: 3, unit_price_minor: 333 }],
    { amount_minor: 1000, currency: 'SAR' }
  ), null);
});

test('validatePartnerItems rejects a grossly mismatched total', () => {
  const err = validatePartnerItems(
    [{ name: 'Meal', quantity: 1, unit_price_minor: 100 }],
    { amount_minor: 5000, currency: 'SAR' }
  );
  assert.strictEqual(err.code, 'item_totals_mismatch');
});

test('validatePartnerItems rejects missing or non-integer prices and bad quantities', () => {
  assert.strictEqual(validatePartnerItems([{ name: 'Meal', quantity: 1 }], { amount_minor: 100 }).code, 'invalid_items');
  assert.strictEqual(validatePartnerItems([{ name: 'Meal', quantity: 1, unit_price_minor: -5 }], { amount_minor: -5 }).code, 'invalid_items');
  assert.strictEqual(validatePartnerItems([{ name: 'Meal', quantity: 0, unit_price_minor: 100 }], { amount_minor: 0 }).code, 'invalid_items');
  assert.strictEqual(validatePartnerItems([], { amount_minor: 0 }).code, 'invalid_items');
  assert.strictEqual(validatePartnerItems([{ name: 'Meal', quantity: 1, unit_price_minor: 100 }], {}).code, 'invalid_merchandise_total');
});
