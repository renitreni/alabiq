'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/merchantRepository');

test('merchant lookup and profile update stay owner scoped with bound values', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 'merchant-1' }] }));
  assert.deepEqual(await repository.loadOwned('owner-1'), { id: 'merchant-1' });
  await repository.updateProfile({
    id: 'merchant-1', ownerId: 'owner-1', fields: {
      name: 'Cafe', cuisine_type: null, description: null, logo_url: null,
      address: 'A', street: null, building_number: null, lat: 1, lng: 2,
    },
  });
  assert.match(query.mock.calls[0].arguments[0], /WHERE owner_id=\$1/);
  assert.match(query.mock.calls[1].arguments[0], /WHERE id=\$10 AND owner_id=\$11/);
  assert.deepEqual(query.mock.calls[1].arguments[1].slice(-2), ['merchant-1', 'owner-1']);
});

test('merchant menu writes allow only the supported columns and tenant id', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 'item-1' }] }));
  await repository.insertMenuItem('merchant-1', {
    name: 'Meal', price: 10, item_type: 'food', malicious_sql: 'ignored',
  });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /INSERT INTO public\.menu_items \(merchant_id,name,price,item_type\)/);
  assert.deepEqual(values, ['merchant-1', 'Meal', 10, 'food']);
  await repository.updateCategory('cat-1', 'merchant-1', { name: 'Lunch', malicious_sql: 'ignored' });
  assert.match(query.mock.calls[1].arguments[0], /WHERE id=\$2 AND merchant_id=\$3/);
  assert.deepEqual(query.mock.calls[1].arguments[1], ['Lunch', 'cat-1', 'merchant-1']);
});

test('merchant analytics are aggregated in PostgreSQL instead of loading every order', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => ({
    rows: sql.includes('menu_items') ? [{ count: 4 }] : [{ status: 'delivered', count: 3 }],
  }));
  const result = await repository.analytics('merchant-1');
  assert.equal(result.menuItemCount, 4);
  assert.equal(result.orderStats[0].count, 3);
  assert.match(query.mock.calls[0].arguments[0], /count\(\*\) FILTER/);
});
