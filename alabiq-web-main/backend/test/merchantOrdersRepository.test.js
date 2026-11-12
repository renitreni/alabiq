'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/merchantOrdersRepository');

test('merchant order feed stays tenant scoped, filters status, and includes safe display joins', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [] }));
  await repository.listForMerchant({ merchantId: 'merchant-1', status: 'accepted', limit: 25 });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /o\.merchant_id=\$1 AND o\.status=\$2/);
  assert.match(sql, /jsonb_agg\(jsonb_build_object/);
  assert.match(sql, /LEFT JOIN public\.profiles rider/);
  assert.deepEqual(values, ['merchant-1', 'accepted', 25]);
});
