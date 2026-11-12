'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/gatewayPaymentRepository');

test('gateway charge bookkeeping uses vertical allowlists and bound values', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rowCount: 1, rows: [{ code: 'FD-1' }] }));
  assert.equal(await repository.recordChargeStart('food', 'FD-1', 'charge-1'), true);
  assert.match(query.mock.calls[0].arguments[0], /UPDATE public\.orders/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['charge-1', 'FD-1']);
  assert.deepEqual(await repository.findByChargeId('ride', 'charge-2'), { code: 'FD-1' });
  assert.match(query.mock.calls[1].arguments[0], /FROM public\.bookings/);
  await assert.rejects(repository.recordChargeStart('unknown', 'x', 'y'), /Unknown payment vertical/);
});

test('failed gateway charges only transition eligible payment states', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rowCount: 1, rows: [] }));
  await repository.markFailed('ride', 'SM-1');
  assert.deepEqual(query.mock.calls[0].arguments[1], [
    'rejected', 'SM-1', ['awaiting_proof', 'proof_uploaded', 'under_review'],
  ]);
  await repository.markFailed('shop', 'SH-1');
  assert.match(query.mock.calls[1].arguments[0], /UPDATE public\.shop_orders/);
  assert.deepEqual(query.mock.calls[1].arguments[1], ['failed', 'SH-1', ['awaiting']]);
});
