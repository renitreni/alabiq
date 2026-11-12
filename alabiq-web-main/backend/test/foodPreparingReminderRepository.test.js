'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/foodPreparingReminderRepository');

test('preparing reminders select overdue orders with joined merchant owner and bounded batch', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 'order-1' }] }));
  const cutoff = new Date('2026-01-01T00:00:00Z');
  const rows = await repository.dueOrders({ cutoff, intervalMs: 60_000, maxCount: 3, limit: 200 });
  assert.equal(rows[0].id, 'order-1');
  assert.match(query.mock.calls[0].arguments[0], /preparing_reminder_last_at IS NULL/);
  assert.match(query.mock.calls[0].arguments[0], /LEFT JOIN public\.merchants/);
  assert.deepEqual(query.mock.calls[0].arguments[1], [3, cutoff, 200]);
});

test('reminder claim is compare-and-swap on order state and prior count', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ order_code: 'FD-1' }] }));
  const at = new Date('2026-01-01T01:00:00Z');
  const claimed = await repository.claimReminder({
    order: { id: 'order-1', status: 'accepted', preparing_reminder_count: 2 }, attempt: 3, at,
  });
  assert.equal(claimed.order_code, 'FD-1');
  assert.match(query.mock.calls[0].arguments[0], /preparing_reminder_count=\$4 AND status=\$5/);
  assert.deepEqual(query.mock.calls[0].arguments[1], [3, at, 'order-1', 2, 'accepted']);
});
