'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/bookingsRepository');

test('booking create binds validated fields and returns the generated public code', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ booking_code: 'SM-1' }] }));
  const booking = await repository.create({
    user_id: 'user-1', trip_type: 'house_to_airport', pickup_address: 'A',
    dropoff_address: 'B', fare_amount: 20, payment_method: 'stcpay_manual',
    unexpected_sql: 'ignored',
  });
  assert.deepEqual(booking, { booking_code: 'SM-1' });
  assert.match(query.mock.calls[0].arguments[0], /INSERT INTO public\.bookings/);
  assert.doesNotMatch(query.mock.calls[0].arguments[0], /unexpected_sql/i);
  assert.deepEqual(query.mock.calls[0].arguments[1], [
    'user-1', 'house_to_airport', 'A', 'B', 20, 'stcpay_manual',
  ]);
});

test('booking cancellation uses a state compare-and-swap', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ booking_status: 'cancelled' }] }));
  const result = await repository.cancel({ id: 'booking-1', statuses: ['confirmed'] });
  assert.equal(result.booking_status, 'cancelled');
  assert.match(query.mock.calls[0].arguments[0], /booking_status=ANY\(\$2::text\[\]\)/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['booking-1', ['confirmed']]);
});

test('booking contact updates allow only the two passenger contact columns and require active status', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ booking_code: 'SM-1' }] }));
  await repository.updateContact({
    booking: { id: 'booking-1' }, userId: 'user-1', isAdmin: false,
    statuses: ['confirmed'], patch: { passenger_mobile: '+1', passenger_whatsapp: '+2', booking_status: 'cancelled' },
  });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.doesNotMatch(sql, /booking_status='cancelled'/);
  assert.match(sql, /booking_status=ANY\(\$6::text\[\]\)/);
  assert.deepEqual(values, ['+1', '+2', 'booking-1', false, 'user-1', ['confirmed']]);
});
