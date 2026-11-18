'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/dispatchRepository');

test('driver location lookup selects the newest fix per driver, then the newest drivers', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [] }));
  const since = new Date('2026-01-01T00:00:00Z');
  await repository.freshDriverLocations(since, 500);
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /row_number\(\) OVER \(PARTITION BY dl\.driver_id ORDER BY dl\.recorded_at DESC\)/);
  assert.match(sql, /ORDER BY recorded_at DESC LIMIT \$2/);
  assert.deepEqual(values, [since, 500]);
});

test('offer job columns are selected from a fixed allowlist and all values are bound', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 'offer-1', expires_at: new Date() }] }));
  const offer = await repository.createOffer({
    jobColumn: 'shop_order_id', targetId: 'order-1', driverId: 'driver-1', round: 2,
    distanceKm: 1.4, expiresAt: new Date('2026-01-01T00:01:00Z'),
  });
  assert.equal(offer.id, 'offer-1');
  assert.match(query.mock.calls[0].arguments[0], /dispatch_offers\(shop_order_id,driver_id,round,distance_km,expires_at\)/);
  assert.deepEqual(query.mock.calls[0].arguments[1], [
    'order-1', 'driver-1', 2, 1.4, new Date('2026-01-01T00:01:00Z'),
  ]);
  await assert.rejects(repository.offeredDriverIds('order_id) DROP TABLE profiles;--', 'x'), /Invalid dispatch job column/);
  assert.equal(query.mock.callCount(), 1);
});

test('release operations preserve compare-and-swap conditions', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => ({
    rows: sql.includes('RETURNING id,booking_code,user_id')
      ? [{ id: 'ride-1', booking_code: 'SM-code', user_id: 'user-1' }]
      : [{ id: 'delivery-1' }],
  }));
  assert.equal(await repository.releaseDelivery('food', 'order-1'), true);
  assert.deepEqual(await repository.releaseRide('ride-1', 'driver-1'), {
    id: 'ride-1', booking_code: 'SM-code', user_id: 'user-1',
  });
  assert.match(query.mock.calls[0].arguments[0], /order_id=\$1 AND status='assigned' RETURNING id/);
  assert.match(query.mock.calls[1].arguments[0], /assigned_driver_id=\$2 AND driver_ride_status=ANY/);
  assert.deepEqual(query.mock.calls[1].arguments[1], ['ride-1','driver-1',['accepted','on_the_way','arrived']]);
});

test('payment expiry candidate filters are bound and cash exclusions stay explicit', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [] }));
  await repository.staleShopOrders('pending', new Date('2026-01-01T00:00:00Z'));
  await repository.staleShopOrders('accepted', new Date('2026-01-02T00:00:00Z'), { excludeCash: true });
  assert.match(query.mock.calls[0].arguments[0], /status=\$1 AND payment_status='awaiting' AND created_at<\$2/);
  assert.match(query.mock.calls[1].arguments[0], /NOT \$3::boolean OR payment_method<>'cash'/);
  assert.deepEqual(query.mock.calls[1].arguments[1], [
    'accepted', new Date('2026-01-02T00:00:00Z'), true,
  ]);
});

test('dispatch repository loads job targets and candidate sets from PostgreSQL', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => {
    if (sql.includes('dispatch_offers WHERE status')) return { rows: [{ driver_id: 'busy-1' }] };
    if (sql.includes('cash_owed >=')) return { rows: [{ id: 'driver-2' }] };
    if (sql.includes('public.orders o')) return { rows: [{ id: 'food-1', merchant_name: 'Cafe' }] };
    if (sql.includes('public.shop_orders o')) return { rows: [{ id: 'shop-1', merchant_name: 'Market' }] };
    if (sql.includes('FROM public.bookings WHERE id')) return { rows: [{ id: 'ride-1', booking_code: 'SM-1' }] };
    return { rows: [] };
  });
  assert.deepEqual(await repository.busyDriverIds(), ['busy-1']);
  assert.deepEqual(await repository.overCashCapDriverIds(300), ['driver-2']);
  assert.equal((await repository.loadFoodTarget('food-1')).merchant_name, 'Cafe');
  assert.equal((await repository.loadShopTarget('shop-1')).merchant_name, 'Market');
  assert.equal((await repository.loadRideTarget('ride-1')).booking_code, 'SM-1');
  assert.equal(query.mock.callCount(), 5);
});

test('delivery setup, releases, and watchdog queries stay within their vertical tables', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => {
    if (sql.includes('RETURNING id,booking_code,user_id')) return {
      rows: [{ id: 'ride-1', booking_code: 'SM-1', user_id: 'user-1' }],
    };
    if (sql.includes('RETURNING id')) return { rows: [{ id: 'delivery-1' }] };
    if (sql.includes('recorded_at')) return { rows: [{ recorded_at: new Date() }] };
    if (sql.includes('order_code,customer_id,merchant_id,status')) return {
      rows: [{ order_code: 'FD-1', customer_id: 'user-1', merchant_id: 'merchant-1', status: 'accepted' }],
    };
    if (sql.includes('SELECT id,driver_id,status')) return { rows: [{ id: 'delivery-1', driver_id: null, status: 'searching' }] };
    if (sql.includes('assigned_driver_id IS NOT NULL')) return { rows: [{ id: 'ride-1', assigned_driver_id: 'driver-1' }] };
    if (sql.includes('d.status=\'assigned\'')) return { rows: [{ order_id: 'order-1', driver_id: 'driver-1' }] };
    return { rows: [] };
  });
  await repository.setDeliveryOpen('food', 'order-1');
  await repository.setDeliveryOpen('shop', 'shop-1');
  assert.match(query.mock.calls[0].arguments[0], /public\.deliveries/);
  assert.match(query.mock.calls[1].arguments[0], /public\.shop_deliveries/);
  assert.equal(await repository.getDelivery('food', 'order-1') instanceof Object, true);
  await repository.createDelivery('shop', 'shop-1');
  assert.equal(await repository.releaseDelivery('shop', 'shop-1'), true);
  assert.equal((await repository.loadOrderSummary('food', 'order-1')).order_code, 'FD-1');
  assert.equal((await repository.abandonedDeliveries('food', ['accepted'])).length, 1);
  assert.ok(await repository.latestLocation('driver-1'));
  assert.equal((await repository.releaseRide('ride-1', 'driver-1')).booking_code, 'SM-1');
  assert.equal((await repository.abandonedRides()).length, 1);
  assert.equal(query.mock.callCount(), 10);
});

test('expiry and payment reconciliation updates are bounded and parameterized', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => ({
    rows: sql.includes('gateway_charge_id') ? [{ order_code: 'FD-1', gateway_charge_id: 'charge-1' }]
      : sql.includes('RETURNING order_code') ? [{ order_code: 'SH-1' }]
        : sql.includes('RETURNING id,order_id') ? [{ id: 'offer-1', order_id: 'food-1' }]
          : [],
  }));
  assert.equal(await repository.cancelUnpaidShopOrder('shop-1'), true);
  assert.equal((await repository.expireOffers(new Date())).length, 1);
  const result = await repository.unconfirmedCharges(
    { table: 'orders', code: 'order_code', paymentStates: ['awaiting'] },
    new Date('2026-01-02'), new Date('2026-01-01'), 20,
  );
  assert.equal(result[0].gateway_charge_id, 'charge-1');
  assert.deepEqual(query.mock.calls[0].arguments[1], ['shop-1',['pending','accepted']]);
  assert.deepEqual(query.mock.calls[2].arguments[1], [
    new Date('2026-01-02'),new Date('2026-01-01'),['awaiting'],20,
  ]);
});
