'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/merchantShopOrdersRepository');

test('store order lookup and feed are scoped to the owning store', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 'order-1' }] }));
  await repository.ownedOrder('store-1', 'SH-1');
  await repository.listForStore('store-1', 10);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['SH-1', 'store-1']);
  assert.match(query.mock.calls[0].arguments[0], /merchant_id=\$2/);
  assert.match(query.mock.calls[1].arguments[0], /LEFT JOIN public\.shop_deliveries d ON d\.order_id=o\.id/);
  assert.match(query.mock.calls[1].arguments[0], /FROM public\.shop_order_items i WHERE i\.order_id=o\.id/);
  assert.deepEqual(query.mock.calls[1].arguments[1], ['store-1', 10]);
});
