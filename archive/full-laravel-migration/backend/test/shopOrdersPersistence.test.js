'use strict';

require('./helpers/pureEnv');
process.env.REALTIME_INTERNAL_URL = 'http://realtime:4100';
process.env.REALTIME_PUBLISH_TOKEN = 'test-publish-token';
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const orders = require('../controllers/shop/ordersController');

test('shop order lookup uses PostgreSQL and a bound order code', async (t) => {
  const expected = { id: 'shop-order-1', order_code: 'SH-code' };
  const query = t.mock.method(database, 'query', async () => ({ rows: [expected] }));
  assert.equal(await orders.loadOrder('SH-code'), expected);
  assert.match(query.mock.calls[0].arguments[0], /FROM public\.shop_orders WHERE order_code=\$1/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['SH-code']);
});

test('shop payment and paid status are committed in one transaction', async (t) => {
  const statements = [];
  t.mock.method(database, 'transaction', async (work) => work({
    query: async (sql, values) => {
      statements.push({ sql, values });
      return { rows: sql.includes('RETURNING id') ? [{ id: 'payment-1' }] : [{ id: 'shop-order-1' }] };
    },
  }));
  t.mock.method(database, 'query', async () => ({ rows: [], rowCount: 1 }));
  const result = await orders.markShopOrderPaid({
    id: 'shop-order-1', order_code: 'SH-code', customer_id: null, merchant_id: 'merchant-1',
    total: '80.00', status: 'pending',
  }, { provider: 'tap', transactionId: 'gateway-shop-1', raw: { verified: true } });
  assert.deepEqual(result, { paymentId: 'payment-1' });
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /INSERT INTO public\.shop_order_payments/);
  assert.match(statements[1].sql, /UPDATE public\.shop_orders SET payment_status='paid'/);
  assert.equal(statements[1].values[1], 'gateway-shop-1');
});
