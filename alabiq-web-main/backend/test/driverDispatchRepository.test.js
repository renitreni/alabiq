'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/driverDispatchRepository');

test('offer feed joins each vertical and preserves the card data shape', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{
    id:'offer-1',order_id:'food-1',food_code:'FD-1',food_total:'15',food_merchant:'Cafe',
    food_dropoff:'Door',food_pickup:'Cafe st',distance_km:2,expires_at:new Date(),
  }] }));
  const offers = await repository.listOffers('driver-1');
  assert.equal(offers[0].orders.order_code, 'FD-1');
  assert.equal(offers[0].orders.merchants.name, 'Cafe');
  assert.match(query.mock.calls[0].arguments[0], /LEFT JOIN public\.shop_orders/);
  assert.deepEqual(query.mock.calls[0].arguments[1][0], 'driver-1');
});

test('driver claims use compare-and-swap predicates and allowlisted vertical tables', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => ({ rows: sql.includes('RETURNING id,booking_code')
    ? [{ id:'ride-1',booking_code:'SM-1',user_id:'user-1' }] : [{ id:'delivery-1' }] }));
  await repository.claimDelivery('shop','order-1','driver-1');
  await repository.claimRide('ride-1','driver-1');
  await repository.acceptOffer({id:'offer-1',driverId:'driver-1'});
  assert.match(query.mock.calls[0].arguments[0], /public\.shop_deliveries/);
  assert.match(query.mock.calls[0].arguments[0], /driver_id IS NULL/);
  assert.match(query.mock.calls[1].arguments[0], /assigned_driver_id IS NULL/);
  assert.match(query.mock.calls[2].arguments[0], /expires_at>\$1/);
});

test('driver delivery feeds are filtered in SQL for assigned and open work', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [] }));
  await repository.deliveryRows('food',{driverId:'driver-1'});
  await repository.deliveryRows('shop',{open:true,statuses:['accepted','packing'],limit:10});
  assert.match(query.mock.calls[0].arguments[0], /d\.driver_id=\$1/);
  assert.match(query.mock.calls[1].arguments[0], /d\.status='open' AND d\.driver_id IS NULL/);
  assert.match(query.mock.calls[1].arguments[0], /o\.status=ANY\(\$1::text\[\]\)/);
  assert.deepEqual(query.mock.calls[1].arguments[1], [['accepted','packing'],10]);
});

test('delivery completion commits order and proof status together with driver ownership and order CAS', async (t) => {
  const calls=[];
  t.mock.method(database,'transaction',async (work)=>work({query:async(sql,values)=>{
    calls.push([sql,values]);
    return sql.includes('UPDATE public.orders')?{rowCount:1,rows:[{order_code:'FD-1'}]}:{rowCount:1,rows:[]};
  }}));
  const result=await repository.setDeliveryStatus({kind:'food',orderId:'order-1',expectedStatus:'out_for_delivery',
    orderStatus:'delivered',deliveryId:'delivery-1',driverId:'driver-1',deliveryStatus:'delivered',
    photoColumn:'delivery_photo_path',photoPath:'FD-1/photo.jpg',at:new Date()});
  assert.equal(result.order_code,'FD-1');
  assert.match(calls[0][0],/status=\$1,delivered_at=\$2/);
  assert.match(calls[0][0],/AND status=\$3/);
  assert.match(calls[1][0],/WHERE id=\$4 AND driver_id=\$5/);
});
