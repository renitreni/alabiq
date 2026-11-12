'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let result;
let failure;
let calls = [];
const poolPath = require.resolve('../lib/database/pool');
const repositoryPath = require.resolve('../repositories/appSettingsRepository');

require.cache[poolPath] = {
  id: poolPath,
  filename: poolPath,
  loaded: true,
  paths: [],
  exports: {
    query: async (text, values) => {
      calls.push({ text, values });
      if (failure) throw failure;
      return result;
    },
  },
};

const repository = require('../repositories/appSettingsRepository');

test.beforeEach(() => {
  calls = [];
  failure = null;
  result = { rows: [{ value: { max: 40 } }] };
});

test('settings reads use a parameterized key and map the first row', async () => {
  const response = await repository.getSetting('max_distance_km');
  assert.deepEqual(response, { data: { value: { max: 40 } }, error: null });
  assert.match(calls[0].text, /WHERE key = \$1/);
  assert.deepEqual(calls[0].values, ['max_distance_km']);
});

test('settings writes parameterize JSON and preserve existing row fields', async () => {
  result = { rows: [{ key: 'max_distance_km', value: null, updated_by: 'user-id' }] };
  const response = await repository.setSetting('max_distance_km', null, 'user-id');
  assert.equal(response.data.key, 'max_distance_km');
  assert.equal(calls[0].values[0], 'max_distance_km');
  assert.equal(calls[0].values[1], 'null');
  assert.equal(calls[0].values[2], 'user-id');
  assert.match(calls[0].text, /ON CONFLICT \(key\) DO UPDATE/);
});

test('database failures are returned for the service layer fallback policy', async () => {
  failure = new Error('database unavailable');
  const response = await repository.getSetting('stcpay_enabled');
  assert.equal(response.data, null);
  assert.equal(response.error, failure);
});
