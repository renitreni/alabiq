require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const { logAudit } = require('../lib/audit');
const { logError } = require('../lib/errorLog');
const { logNotification, notifyAdmins } = require('../lib/notifications');

test('audit writes use bound PostgreSQL values and failures remain best effort', async (t) => {
  let fail = false;
  const query = t.mock.method(database, 'query', async () => {
    if (fail) throw new Error('offline');
    return { rowCount: 1, rows: [] };
  });
  await logAudit({ actorId: 'user-1', action: 'settings.update', resourceType: 'app_settings', resourceId: 'max-distance', meta: { value: 20 } });
  assert.match(query.mock.calls[0].arguments[0], /INSERT INTO public\.audit_logs/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['user-1', 'settings.update', 'app_settings', 'max-distance', { value: 20 }]);

  fail = true;
  await assert.doesNotReject(logAudit({ action: 'noop' }));
});

test('error records are redacted before their parameterized insert', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rowCount: 1, rows: [] }));
  await logError({ label: 'test failure', message: 'Bearer abcdefghijklmnop secret=private-value' });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /INSERT INTO public\.error_logs/);
  assert.equal(values[2].includes('private-value'), false);
  assert.equal(values[2].includes('abcdefghijklmnop'), false);
  assert.equal(values[1], 'test failure');
});

test('notifications persist a returned row and notify only PostgreSQL admin profiles', async (t) => {
  const notification = {
    id: 'notification-1', type: 'ride_booking_created', booking_id: 'booking-1', order_id: null,
    shop_order_id: null, code: null, channel: 'in_app', read_at: null,
    sent_at: new Date().toISOString(), created_at: new Date().toISOString(),
  };
  const query = t.mock.method(database, 'query', async (sql) => {
    if (sql.includes('INSERT INTO public.notification_events')) return { rows: [notification] };
    return { rows: [{ id: 'admin-1' }] };
  });
  const result = await logNotification({ userId: 'user-1', bookingId: 'booking-1', type: 'ride_booking_created' });
  assert.equal(result.id, 'notification-1');
  await notifyAdmins({ type: 'admin_food_order_created' });
  assert.ok(query.mock.calls.some((call) => call.arguments[0].includes("FROM public.profiles WHERE role='admin'")));
});
