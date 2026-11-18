'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/driverDocumentsRepository');

test('driver document replacement is atomic with verification-status reopening', async (t) => {
  const client = {
    query: t.mock.fn(async (sql) => ({ rows: sql.includes('RETURNING') ? [{ id: 'doc-1' }] : [] })),
    release: t.mock.fn(),
  };
  t.mock.method(database, 'transaction', async (work) => work(client));
  const result = await repository.replace({
    driverId: 'driver-1', document: { doc_type: 'license', path: 'driver/file', size_bytes: 25 },
  });
  assert.deepEqual(result, { id: 'doc-1' });
  assert.match(client.query.mock.calls[0].arguments[0], /DELETE FROM public\.driver_documents/);
  assert.match(client.query.mock.calls[1].arguments[0], /INSERT INTO public\.driver_documents/);
  assert.match(client.query.mock.calls[2].arguments[0], /driver_verification_status='submitted'/);
});

test('document reads are driver scoped and exclude storage paths', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [] }));
  await repository.listForDriver('driver-1');
  assert.match(query.mock.calls[0].arguments[0], /WHERE driver_id=\$1/);
  assert.doesNotMatch(query.mock.calls[0].arguments[0], /storage_path/);
});
