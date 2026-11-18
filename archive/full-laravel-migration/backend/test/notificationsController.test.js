require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const controller = require('../controllers/notificationsController');

function response() { return { statusCode:200, body:null, status(n){this.statusCode=n;return this;}, json(v){this.body=v;return this;} }; }

test('device token registration binds ownership and updates the existing token', async (t) => {
  const query=t.mock.method(database,'query',async()=>({rows:[],rowCount:1}));
  const res=response();
  await controller.registerToken({userId:'user-1',body:{token:'opaque-token',platform:'ios',app_version:'1.2'}},res);
  assert.equal(res.statusCode,201);
  assert.match(query.mock.calls[0].arguments[0],/ON CONFLICT \(token\) DO UPDATE/);
  assert.deepEqual(query.mock.calls[0].arguments[1],['user-1','opaque-token','ios','1.2']);
});

test('notification listing and mark-read are scoped to the authenticated profile', async (t) => {
  const calls=[];
  t.mock.method(database,'query',async(sql,values)=>{
    calls.push({sql,values});
    return sql.startsWith('SELECT') ? {rows:[{id:'notification-1'}]} : {rows:[],rowCount:2};
  });
  const listed=response();
  await controller.listMyNotifications({userId:'user-2'},listed);
  assert.equal(listed.body.notifications[0].id,'notification-1');
  const marked=response();
  await controller.markAllRead({userId:'user-2'},marked);
  assert.ok(marked.body.readAt);
  assert.deepEqual(calls.map(({values})=>values[0]),['user-2','user-2']);
});
