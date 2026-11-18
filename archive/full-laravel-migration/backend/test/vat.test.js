require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const { vatFor, vatLabel } = require('../lib/vat');

test('VAT is added on top of the pre-tax base at 15 percent', () => {
  assert.deepEqual(vatFor(50), { vatRate: 0.15, vatAmount: 7.5 });
  assert.deepEqual(vatFor(103.75), { vatRate: 0.15, vatAmount: 15.56 }); // 15.5625, half-up
});

test('the rate is returned alongside the amount so it can be snapshotted on the row', () => {
  // Migration 0025 stores both. A receipt reprinted after a rate change must
  // show the tax actually charged, so nothing downstream may recompute.
  const { vatRate } = vatFor(50);
  assert.equal(vatRate, 0.15);
});

test('a zero, negative or unusable base produces no tax rather than a negative one', () => {
  // Reaches here from an all-refund or a malformed line; the answer is "no
  // tax", never a credit to the tax authority.
  for (const base of [0, -50, NaN, null, undefined, 'abc']) {
    assert.equal(vatFor(base).vatAmount, 0, `vatFor(${String(base)})`);
  }
});

test('the receipt label renders the rate as a whole percentage', () => {
  assert.equal(vatLabel(), 'VAT (15%)');
  assert.equal(vatLabel(0.05), 'VAT (5%)');
});
