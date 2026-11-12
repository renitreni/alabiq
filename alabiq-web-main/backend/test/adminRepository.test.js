'use strict';

require('./helpers/pureEnv');
const test=require('node:test');
const assert=require('node:assert/strict');
const database=require('../lib/database/pool');
const repository=require('../repositories/adminRepository');

test('admin dashboard uses grouped PostgreSQL counts and driver aggregates',async(t)=>{
  const query=t.mock.method(database,'query',async(sql)=>({rows:sql.includes('driver_approved')?[{total:4,approved:3}]:[]}));
  await repository.bookingStats();
  const stats=await repository.driverStats();
  assert.equal(stats.approved,3);
  assert.match(query.mock.calls[0].arguments[0],/GROUP BY booking_status,payment_status/);
  assert.match(query.mock.calls[0].arguments[0],/date_trunc\('day',now\(\)\)/);
});

test('admin booking pagination uses parameterized optional filters and separate exact count',async(t)=>{
  const query=t.mock.method(database,'query',async(sql)=>sql.includes('count(*)')?{rows:[{total:11}]}:{rows:[{booking_code:'SM-1'}]});
  const result=await repository.listBookings({limit:5,offset:10,bookingStatus:'confirmed',paymentStatus:'verified'});
  assert.equal(result.total,11);
  assert.deepEqual(result.rows,[{booking_code:'SM-1'}]);
  assert.deepEqual(query.mock.calls[0].arguments[1],['confirmed','verified']);
  assert.deepEqual(query.mock.calls[1].arguments[1],['confirmed','verified',5,10]);
  assert.match(query.mock.calls[1].arguments[0],/LIMIT \$3 OFFSET \$4/);
});

test('document review updates the document and driver standing in a transaction',async(t)=>{
  const calls=[];
  t.mock.method(database,'transaction',async(work)=>work({query:async(sql)=>{
    calls.push(sql);
    if(sql.includes('RETURNING id,doc_type,status')) return {rowCount:1,rows:[{id:'doc-1',doc_type:'license',status:'verified'}]};
    if(sql.includes('SELECT doc_type,status')) return {rows:[{doc_type:'license',status:'verified'},{doc_type:'id',status:'verified'}]};
    return {rowCount:1,rows:[]};
  }}));
  const result=await repository.reviewDriverDocument({driverId:'driver-1',docId:'doc-1',status:'verified',
    reason:null,adminId:'admin-1',requiredTypes:['license','id']});
  assert.equal(result.driverApproved,true);
  assert.equal(result.verificationStatus,'approved');
  assert.match(calls[2],/UPDATE public\.profiles SET driver_verification_status/);
});
