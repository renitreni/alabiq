'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const dispatchPath = require.resolve('../lib/dispatch');

test('payment verification writes payment, proof, and booking in one transaction', async (t) => {
  const statements = [];
  const updatedBooking = {
    booking_code: 'SM-payment-test', payment_status: 'verified', booking_status: 'confirmed',
    verification_mode: 'gateway_webhook', confirmed_at: new Date(),
  };
  t.mock.method(database, 'transaction', async (work) => work({
    query: async (sql, values) => {
      statements.push({ sql, values });
      return { rows: sql.includes('UPDATE public.bookings') ? [updatedBooking] : [] };
    },
  }));
  t.mock.method(database, 'query', async () => ({ rows: [], rowCount: 1 }));
  const originalDispatch = require.cache[dispatchPath];
  require.cache[dispatchPath] = {
    id: dispatchPath, filename: dispatchPath, loaded: true, paths: [],
    exports: { startRideDispatch() {} },
  };
  t.after(() => {
    if (originalDispatch) require.cache[dispatchPath] = originalDispatch;
    else delete require.cache[dispatchPath];
  });

  const { verifyBookingPayment } = require('../lib/payments');
  const result = await verifyBookingPayment({
    booking: { id: 'booking-id', booking_code: 'SM-payment-test', fare_amount: 100,
      vat_amount: 15, total_amount: 115, currency: 'SAR' },
    mode: 'gateway_webhook', provider: 'tap', gateway: { paymentId: 'tap-payment', status: 'CAPTURED', raw: { ok: true } },
    proofId: 'proof-id',
  });
  assert.equal(result.booking, updatedBooking);
  assert.equal(statements.length, 3);
  assert.match(statements[0].sql, /INSERT INTO public\.payments/);
  assert.match(statements[1].sql, /UPDATE public\.payment_proofs/);
  assert.match(statements[2].sql, /UPDATE public\.bookings/);
  assert.equal(statements[0].values[10], 'tap-payment');
  assert.equal(statements[1].values[0], 'proof-id');
});
