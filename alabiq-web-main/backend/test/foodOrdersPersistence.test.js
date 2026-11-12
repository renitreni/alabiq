'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const orders = require('../controllers/food/ordersController');

test('food order lookup uses the PostgreSQL order code predicate', async (t) => {
  const expected = { id: 'order-1', order_code: 'FD-code', status: 'pending' };
  const query = t.mock.method(database, 'query', async () => ({ rows: [expected] }));
  assert.equal(await orders.loadOrder('FD-code'), expected);
  assert.match(query.mock.calls[0].arguments[0], /FROM public\.orders WHERE order_code=\$1/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['FD-code']);
});

test('food payment row and order state update commit in one transaction', async (t) => {
  const statements = [];
  t.mock.method(database, 'transaction', async (work) => work({
    query: async (sql, values) => {
      statements.push({ sql, values });
      return { rows: sql.includes('RETURNING id') ? [{ id: 'payment-1' }] : [{ id: 'order-1' }] };
    },
  }));
  t.mock.method(database, 'query', async () => ({ rows: [], rowCount: 1 }));
  const result = await orders.markOrderPaid({
    id: 'order-1', order_code: 'FD-code', customer_id: null, merchant_id: 'merchant-1',
    total: '35.00', status: 'pending',
  }, { provider: 'tap', transactionId: 'gateway-1', raw: { verified: true } });
  assert.deepEqual(result, { paymentId: 'payment-1' });
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /INSERT INTO public\.order_payments/);
  assert.match(statements[1].sql, /UPDATE public\.orders SET payment_status='paid'/);
  assert.equal(statements[1].values[1], 'gateway-1');
});

test('duplicate food payment reference reconciles the order to paid', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [], rowCount: 1 }));
  t.mock.method(database, 'transaction', async () => {
    throw Object.assign(new Error('duplicate reference'), { code: '23505' });
  });
  const result = await orders.markOrderPaid({
    id: 'order-2', order_code: 'FD-retry', customer_id: null, merchant_id: 'merchant-1',
    total: '35.00', status: 'pending',
  }, { provider: 'tap', transactionId: 'gateway-existing' });
  assert.deepEqual(result, { alreadyPaid: true });
  assert.match(query.mock.calls[0].arguments[0], /payment_status='awaiting'/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['order-2', 'gateway-existing']);
});
