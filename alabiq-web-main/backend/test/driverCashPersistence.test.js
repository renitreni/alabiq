require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const { chargeDriverCashOwed, settleDriverCash } = require('../lib/driverCash');

function fakeClient(startingBalance) {
  const calls=[];
  return { calls, async query(sql, values) {
    calls.push({sql,values});
    if (sql.startsWith('SELECT cash_owed')) return { rows:[{cash_owed:startingBalance}] };
    return { rows:[], rowCount:1 };
  } };
}

test('driver cash charge updates balance and ledger in one transaction', async (t) => {
  const client=fakeClient('20.00');
  t.mock.method(database,'transaction',(work)=>work(client));
  const result=await chargeDriverCashOwed({driverId:'driver-1',bookingId:'booking-1',amount:12.34,note:'fare'});
  assert.deepEqual(result,{ok:true,balanceAfter:32.34});
  assert.equal(client.calls.length,3);
  assert.match(client.calls[2].sql,/INSERT INTO public\.driver_cash_ledger/);
  assert.equal(client.calls[2].values[2],12.34);
});

test('driver settlement floors balance at zero and records the payment atomically', async (t) => {
  const client=fakeClient('5.00');
  t.mock.method(database,'transaction',(work)=>work(client));
  const result=await settleDriverCash({driverId:'driver-2',amount:8,adminId:'admin-1'});
  assert.deepEqual(result,{ok:true,balanceAfter:0});
  assert.match(client.calls[2].sql,/INSERT INTO public\.driver_cash_ledger/);
  assert.equal(client.calls[2].values[2],0);
});
