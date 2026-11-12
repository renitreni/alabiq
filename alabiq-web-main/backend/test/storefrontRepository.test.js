'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/storefrontRepository');

test('storefront discovery scopes the vertical and binds search, category, and limit', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [] }));
  await repository.listMerchants('food', { q: 'A%_', category: 'Cafe', featured: true, limit: 20 });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /vertical=\$1/);
  assert.match(sql, /name ILIKE \$2/);
  assert.match(sql, /cuisine_type=\$3/);
  assert.match(sql, /is_featured=true/);
  assert.deepEqual(values, ['food', '%A\\%\\_%', 'Cafe', 20]);
});

test('ratings and menu readiness aggregate in PostgreSQL and skip empty id lists', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ merchant_id: 'm1', rating: '4.5', review_count: 2 }] }));
  assert.deepEqual(await repository.ratings('shop', []), []);
  assert.deepEqual(await repository.ratings('shop', ['m1']), [{ merchant_id: 'm1', rating: '4.5', review_count: 2 }]);
  assert.match(query.mock.calls[0].arguments[0], /avg\(product_rating\)/);
  assert.deepEqual(query.mock.calls[0].arguments[1], [['m1']]);
});

test('store catalogue uses a stock-safe backend query shape for products and variants', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [] }));
  await repository.products('merchant-1');
  assert.match(query.mock.calls[0].arguments[0], /jsonb_agg\(jsonb_build_object/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['merchant-1']);
});
