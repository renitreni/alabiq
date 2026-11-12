'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const cards = require('../lib/savedCards');

test('saved-card list exposes only public fields and uses caller ownership scope', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [
    { id: 'card-row', brand: 'visa', funding: 'credit', last4: '4242', exp_month: 12,
      exp_year: 2099, is_default: true, last_used_at: null, created_at: new Date() },
  ] }));
  const result = await cards.listMethods('user-7');
  assert.equal(result[0].id, 'card-row');
  assert.equal('gateway_card_id' in result[0], false);
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /WHERE user_id=\$1 AND deleted_at IS NULL/);
  assert.match(sql, /ORDER BY is_default DESC,created_at DESC/);
  assert.deepEqual(values, ['user-7']);
});

test('chargeable saved-card lookup binds both id and owner in SQL', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [] }));
  assert.equal(await cards.loadOwnedMethod('owner-1', 'card-row'), null);
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /WHERE id=\$1 AND user_id=\$2 AND deleted_at IS NULL/);
  assert.deepEqual(values, ['card-row', 'owner-1']);
});

test('default card changes use the PostgreSQL function for one atomic operation', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ result: true }] }));
  assert.equal(await cards.setDefault('owner-2', 'card-row'), true);
  assert.match(query.mock.calls[0].arguments[0], /public\.set_default_payment_method\(\$1,\$2\)/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['owner-2', 'card-row']);
});
