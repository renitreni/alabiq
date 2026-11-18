'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/shopManagementRepository');

test('store owner lookup, scoped updates, and category checks stay within the shop tenant', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 'store-1' }] }));
  await repository.storeByOwner('owner-1');
  await repository.updateStore({
    id: 'store-1', ownerId: 'owner-1', fields: { name: 'Store', net_price: 1 },
  });
  await repository.owned('product_categories', 'cat-1', 'store-1');
  assert.match(query.mock.calls[0].arguments[0], /vertical='shop'/);
  assert.match(query.mock.calls[1].arguments[0], /WHERE id=\$2 AND owner_id=\$3/);
  assert.doesNotMatch(query.mock.calls[1].arguments[0], /net_price/);
  assert.deepEqual(query.mock.calls[1].arguments[1], ['Store', 'store-1', 'owner-1']);
  assert.match(query.mock.calls[2].arguments[0], /public\.product_categories/);
});

test('product inserts ignore protected fields and variant writes remain product scoped', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 'row-1' }] }));
  await repository.insertProduct('store-1', { name: 'Milk', price: 10, net_price: 5 });
  await repository.updateVariant('variant-1', 'product-1', { label: 'Large', net_price: 7 });
  assert.doesNotMatch(query.mock.calls[0].arguments[0], /net_price/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['store-1', 'Milk', 10]);
  assert.match(query.mock.calls[1].arguments[0], /WHERE id=\$2 AND product_id=\$3/);
  assert.deepEqual(query.mock.calls[1].arguments[1], ['Large', 'variant-1', 'product-1']);
});

test('store catalogue and analytics aggregate through PostgreSQL', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => ({
    rows: sql.includes('shop_orders') ? [{ status: 'delivered', count: 2, delivered_total: '30' }] : [{ products: 4, categories: 2 }],
  }));
  const analytics = await repository.analytics('store-1');
  assert.deepEqual(analytics.counts, { products: 4, categories: 2 });
  assert.match(query.mock.calls[0].arguments[0], /sum\(total\) FILTER/);
  assert.match(query.mock.calls[1].arguments[0], /count\(\*\)::int FROM public\.products/);
});
