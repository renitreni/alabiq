'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/driverRepository');

test('available rides are payable, confirmed, and remain unassigned', async (t) => {
  const query=t.mock.method(database,'query',async()=>({rows:[]}));
  await repository.availableRides();
  const sql=query.mock.calls[0].arguments[0];
  assert.match(sql,/payment_status='verified' OR payment_method='cash'/);
  assert.match(sql,/booking_status='confirmed' AND assigned_driver_id IS NULL/);
});

test('ride claim and status updates are compare-and-swap writes', async (t) => {
  const query=t.mock.method(database,'query',async()=>({rows:[{booking_code:'SM-1'}]}));
  await repository.claimRide('ride-1','driver-1');
  await repository.updateRideStatus({booking:{id:'ride-1',driver_ride_status:'accepted'},driverId:'driver-1',status:'on_the_way',bookingStatus:'driver_on_the_way'});
  assert.match(query.mock.calls[0].arguments[0],/assigned_driver_id IS NULL AND booking_status='confirmed'/);
  assert.match(query.mock.calls[1].arguments[0],/assigned_driver_id=\$4 AND driver_ride_status=\$5/);
  assert.deepEqual(query.mock.calls[1].arguments[1],['on_the_way','driver_on_the_way','ride-1','driver-1','accepted']);
});

test('active rider tracking joins each delivery vertical to its order', async (t) => {
  const query=t.mock.method(database,'query',async()=>({rows:[]}));
  await repository.activeDeliveries('food','driver-1',['ready']);
  await repository.activeDeliveries('shop','driver-1',['packing']);
  assert.match(query.mock.calls[0].arguments[0],/public\.deliveries d JOIN public\.orders/);
  assert.match(query.mock.calls[1].arguments[0],/public\.shop_deliveries d JOIN public\.shop_orders/);
});
