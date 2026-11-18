'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/paymentProofRepository');

test('proof metadata and booking review state are written in one transaction', async (t) => {
  const calls = [];
  t.mock.method(database, 'transaction', async (work) => work({
    query: async (sql, values) => {
      calls.push([sql, values]);
      return sql.includes('INSERT') ? { rows: [{ id: 'proof-1' }] } : { rowCount: 1, rows: [{ id: 'booking-1' }] };
    },
  }));
  assert.deepEqual(await repository.record({
    booking: { id: 'booking-1' }, proof: { path: 'proofs/x', size_bytes: 25 },
  }), { id: 'proof-1' });
  assert.match(calls[0][0], /INSERT INTO public\.payment_proofs/);
  assert.match(calls[1][0], /payment_status=ANY\(\$2::text\[\]\)/);
  assert.deepEqual(calls[1][1], ['booking-1', ['awaiting_proof','proof_uploaded','under_review','rejected']]);
});
