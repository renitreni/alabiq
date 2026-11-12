'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/ledgerRepository');

test('ledger insert is idempotent under concurrent booking completion', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => {
    if (sql.includes('INSERT')) return { rows: [] };
    return { rows: [{ id: 'ledger-existing' }] };
  });
  const result = await repository.createForBooking({
    bookingId: 'booking-1', driverId: null, payoutStatus: 'pending',
    amounts: { gross_fare: 10, platform_commission: 1, manual_payment_fee: 0.2,
      driver_gross: 10, driver_net: 8.8, platform_net: 1.2 },
  });
  assert.deepEqual(result, { ledger: { id: 'ledger-existing' }, skipped: true });
  assert.match(query.mock.calls[0].arguments[0], /ON CONFLICT \(booking_id\) DO NOTHING/);
  assert.deepEqual(query.mock.calls[0].arguments[1], [
    'booking-1', null, 10, 1, 0.2, 10, 8.8, 1.2, 'pending',
  ]);
});
