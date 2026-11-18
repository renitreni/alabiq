require('./helpers/pureEnv');
process.env.TAP_SECRET_KEY = 'sk_test_not_a_real_key';

const test = require('node:test');
const assert = require('node:assert/strict');

const savedCards = require('../lib/savedCards');
const tap = require('../lib/tap');
const { chargeForOrder } = require('../lib/cardCharge');

const req = { get: () => '', ip: '127.0.0.1' };
const base = { req, profile: { id: 'u1' }, vertical: 'food', code: 'FD-TEST', amount: 50, redirectPath: '/x' };

// Every one of these paths answers the customer with the same "please try
// again". A card payment failed in production with nothing in the logs, so
// what is pinned here is that the reason reaches console.error.
function captureErrors(t) {
  const lines = [];
  t.mock.method(console, 'error', (...args) => lines.push(args));
  return lines;
}

test('a failed customer lookup is logged with its stage and reason', async (t) => {
  const lines = captureErrors(t);
  t.mock.method(savedCards, 'ensureCustomer', async () => {
    const err = new Error('relation "payment_customers" does not exist');
    err.code = '42P01';
    throw err;
  });

  const result = await chargeForOrder(base);

  assert.equal(result.kind, 'error');
  assert.equal(result.status, 502);
  assert.equal(lines.length, 1);
  assert.equal(lines[0][0], 'cardCharge: customer failed');
  assert.equal(lines[0][1].detail, '42P01');
  assert.equal(lines[0][1].code, 'FD-TEST');
});

test('a network failure on the charge is logged, not only a gateway rejection', async (t) => {
  const lines = captureErrors(t);
  t.mock.method(savedCards, 'ensureCustomer', async () => 'cus_1');
  t.mock.method(tap, 'createCharge', async () => {
    throw new tap.TapError('gateway', 'Could not reach the payment gateway', 'fetch failed');
  });

  const result = await chargeForOrder(base);

  assert.equal(result.status, 502);
  assert.equal(lines[0][0], 'cardCharge: new card charge failed');
  assert.equal(lines[0][1].kind, 'gateway');
  assert.equal(lines[0][1].detail, 'fetch failed');
});

test('a redirect from Tap logs nothing', async (t) => {
  const lines = captureErrors(t);
  t.mock.method(savedCards, 'ensureCustomer', async () => 'cus_1');
  t.mock.method(tap, 'createCharge', async () => ({
    id: 'chg_1',
    status: 'INITIATED',
    transaction: { url: 'https://tap.example/pay' },
  }));

  const result = await chargeForOrder(base);

  assert.equal(result.kind, 'redirect');
  assert.equal(result.url, 'https://tap.example/pay');
  assert.equal(lines.length, 0);
});
