'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const hours = require('../lib/merchantHours');
const { merchantOpenState } = require('../lib/storeHours');

test('hours reads are scoped to one merchant and ordered for display', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [
    { weekday: 1, opens_at: '09:00:00', closes_at: '17:00:00' },
  ] }));
  const result = await hours.listHours('merchant-1');
  assert.equal(result.length, 1);
  assert.match(query.mock.calls[0].arguments[0], /WHERE merchant_id=\$1 ORDER BY weekday,opens_at/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['merchant-1']);
});

test('replacing hours validates first and atomically replaces the schedule', async (t) => {
  const statements = [];
  const transaction = t.mock.method(database, 'transaction', async (work) => work({
    query: async (sql, values) => statements.push({ sql, values }),
  }));
  const result = await hours.replaceHours('merchant-2', [
    { weekday: 2, opens_at: '10:00', closes_at: '18:00' },
    { weekday: 4, opens_at: '11:00', closes_at: '19:00' },
  ]);
  assert.equal(result.ok, true);
  assert.equal(transaction.mock.callCount(), 1);
  assert.equal(statements.length, 3);
  assert.match(statements[0].sql, /DELETE FROM public\.merchant_hours/);
  assert.deepEqual(statements[1].values, ['merchant-2', 2, '10:00', '18:00']);
  assert.deepEqual(statements[2].values, ['merchant-2', 4, '11:00', '19:00']);

  const invalid = await hours.replaceHours('merchant-2', [{ weekday: 7, opens_at: '10:00', closes_at: '18:00' }]);
  assert.equal(invalid.ok, false);
  assert.equal(transaction.mock.callCount(), 1);
});

test('opening-hours lookup fails open when PostgreSQL is temporarily unavailable', async (t) => {
  t.mock.method(database, 'query', async () => { throw new Error('offline'); });
  const result = await merchantOpenState('merchant-3', true);
  assert.deepEqual(result, { open: true, reason: null });
});
