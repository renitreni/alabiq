'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/trackingRepository');

test('tracking repository loads a public-code booking, ordered timeline, and safe driver contact', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => {
    if (sql.includes('FROM public.bookings')) return { rows: [{ id: 'booking-1' }] };
    if (sql.includes('tracking_events')) return { rows: [{ event_type: 'created' }] };
    return { rows: [{ full_name: 'Driver', whatsapp_number: '+1' }] };
  });
  assert.deepEqual(await repository.bookingByCode('SM-42'), { id: 'booking-1' });
  assert.deepEqual(await repository.eventsForBooking('booking-1'), [{ event_type: 'created' }]);
  assert.deepEqual(await repository.driverContact('driver-1'), {
    full_name: 'Driver', whatsapp_number: '+1',
  });
  assert.deepEqual(query.mock.calls.map(({ arguments: args }) => args[1]), [
    ['SM-42'], ['booking-1'], ['driver-1'],
  ]);
  assert.match(query.mock.calls[1].arguments[0], /ORDER BY created_at ASC/);
  assert.doesNotMatch(query.mock.calls[2].arguments[0], /email|password|role/);
});
