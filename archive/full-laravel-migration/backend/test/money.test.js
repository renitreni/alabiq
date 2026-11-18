require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const { round2 } = require('../lib/money');

// The idiom round2 replaced, kept here as the thing the regressions are
// measured against. Six copies of this line were live.
const legacyEpsilonRound = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

test('round2 rounds a half up instead of down at the amounts VAT actually produces', () => {
  // 50.50 x 15% is exactly 7.5750. The platform charges 7.58 and owes ZATCA
  // 7.58; the old idiom returned 7.57 and the difference came out of margin.
  assert.equal(round2(50.5 * 0.15), 7.58);
  assert.equal(legacyEpsilonRound(50.5 * 0.15), 7.57);

  // Same shape at a second live base, to show it is a class of failure and
  // not one unlucky number.
  assert.equal(round2(30.1 * 0.15), 4.52);
  assert.equal(legacyEpsilonRound(30.1 * 0.15), 4.51);
});

test('round2 rounds a refund away from zero so a half-halala credit is not lost', () => {
  // Math.round breaks ties toward +Infinity, so -0.005 would become -0 and
  // the customer would be refunded a halala less than they were charged.
  assert.equal(round2(-0.005), -0.01);
  assert.equal(round2(-7.575), -7.58);
  // A negative that rounds away to nothing must come back as +0, not -0:
  // (-0).toFixed(2) renders "-0.00", so a zero-value refund line would print
  // as minus zero on a customer receipt.
  assert.ok(Object.is(round2(-0.001), 0));
  assert.equal(round2(-0.001).toFixed(2), '0.00');
});

test('round2 turns anything that is not a finite number into 0', () => {
  // Money math must not propagate NaN into a stored order total, so a bad
  // input collapses to zero rather than to a poisoned figure.
  for (const bad of [NaN, Infinity, -Infinity, undefined, 'abc', {}, []]) {
    assert.equal(round2(bad), 0, `round2(${String(bad)})`);
  }
});

test('round2 is idempotent, so a figure re-rounded downstream never moves', () => {
  // Totals are rounded at the money boundary and then rounded again by
  // callers that do not know that. Twice must equal once.
  for (const n of [7.575, 0.005, 103.75, 1.005, -2.675, 0]) {
    assert.equal(round2(round2(n)), round2(n), `round2 twice on ${n}`);
  }
});

test('round2 keeps whole and already-2dp amounts exactly as they are', () => {
  assert.equal(round2(0), 0);
  assert.equal(round2(100), 100);
  assert.equal(round2(1.99), 1.99);
  assert.equal(round2('12.34'), 12.34, 'numeric strings from the DB are coerced, not rejected');
});
