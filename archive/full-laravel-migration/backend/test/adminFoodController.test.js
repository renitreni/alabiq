require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../controllers/food/adminFoodController');
const foodRepository = require('../repositories/adminFoodRepository');

function res() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('listOrders uses result.rows and result.total (regression test for result.data/undefined total bug)', async (t) => {
  const mockOrders = [
    { id: 'o-1', order_code: 'FD-1', status: 'accepted', payment_status: 'awaiting', payment_method: 'stcpay', subtotal: 50, delivery_fee: 10, platform_margin_total: 5, vat_amount: 7.5, total: 67.5, delivery_address: 'Riyadh', delivery_street: 'King Fahd', delivery_building: '1', contact_phone: '055', created_at: '2026-10-01T12:00:00Z', accepted_at: '2026-10-01T12:05:00Z', merchants: { id: 'm-1', name: 'Bistro' }, profiles: { full_name: 'Ali', mobile_number: '055' }, deliveries: null, order_items: [{ name_snapshot: 'Meal', size_snapshot: 'L', quantity: 1, line_total: 30 }] },
    { id: 'o-2', order_code: 'FD-2', status: 'preparing', payment_status: 'paid', payment_method: 'tap', subtotal: 80, delivery_fee: 10, platform_margin_total: 8, vat_amount: 12, total: 102, delivery_address: 'Jeddah', delivery_street: 'Corniche', delivery_building: '2', contact_phone: '056', created_at: '2026-10-01T13:00:00Z', accepted_at: '2026-10-01T13:05:00Z', merchants: { id: 'm-2', name: 'Cafe' }, profiles: { full_name: 'Sara', mobile_number: '056' }, deliveries: null, order_items: [{ name_snapshot: 'Coffee', size_snapshot: 'M', quantity: 2, line_total: 40 }] },
  ];

  t.mock.method(foodRepository, 'listOrders', async ({ offset, limit, sortBy, sortOrder, search, status, paymentStatus, filters }) => ({
    rows: mockOrders,
    total: 42
  }));

  t.mock.method(foodRepository, 'awaitingPaymentsForOrders', async () => []);

  const request = {
    query: { page: '2', limit: '25', sortBy: 'created_at', sortOrder: 'desc', search: '', filters: '{}' },
    adminId: 'admin-1'
  };
  const response = res();

  await controller.listOrders(request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.length, 2);
  assert.equal(response.body.data[0].orderCode, 'FD-1');
  assert.equal(response.body.data[1].orderCode, 'FD-2');

  // Verify pagination uses result.total (was undefined 'total' before fix)
  assert.equal(response.body.pagination.total, 42);
  assert.equal(response.body.pagination.page, 2);
  assert.equal(response.body.pagination.limit, 25);
  assert.equal(response.body.pagination.totalPages, Math.ceil(42 / 25));
  assert.equal(response.body.pagination.hasNext, 2 < Math.ceil(42 / 25));
  assert.equal(response.body.pagination.hasPrev, true);

  // Verify preparingReminderMinutes is passed through
  assert.ok(Number.isFinite(response.body.preparingReminderMinutes));
});

test('listOrders passes offset (not page) to repository for pagination', async (t) => {
  let capturedArgs = null;
  t.mock.method(foodRepository, 'listOrders', async (args) => {
    capturedArgs = args;
    return { rows: [], total: 0 };
  });
  t.mock.method(foodRepository, 'awaitingPaymentsForOrders', async () => []);

  const request = {
    query: { page: '3', limit: '50', filters: '{}' },
    adminId: 'admin-1'
  };
  const response = res();

  await controller.listOrders(request, response);

  // Controller must calculate offset = (page - 1) * limit and pass it
  assert.ok(capturedArgs);
  assert.equal(capturedArgs.offset, 100); // (3-1)*50
  assert.equal(capturedArgs.limit, 50);
  assert.equal(capturedArgs.page, undefined, 'repository does not accept page, only offset');
});

test('listOrders handles empty awaitingIds without calling awaitingPaymentsForOrders', async (t) => {
  const mockOrders = [
    { id: 'o-1', order_code: 'FD-1', status: 'delivered', payment_status: 'paid', payment_method: 'tap', subtotal: 50, delivery_fee: 10, platform_margin_total: 5, vat_amount: 7.5, total: 67.5, delivery_address: 'Riyadh', delivery_street: 'King Fahd', delivery_building: '1', contact_phone: '055', created_at: '2026-10-01T12:00:00Z', accepted_at: '2026-10-01T12:05:00Z', merchants: { id: 'm-1', name: 'Bistro' }, profiles: { full_name: 'Ali', mobile_number: '055' }, deliveries: null, order_items: [] },
  ];

  t.mock.method(foodRepository, 'listOrders', async () => ({
    rows: mockOrders,
    total: 1
  }));

  const awaitingPaymentsCalls = [];
  t.mock.method(foodRepository, 'awaitingPaymentsForOrders', async (ids) => {
    awaitingPaymentsCalls.push(ids);
    return [];
  });

  const request = {
    query: { page: '1', limit: '25', filters: '{}' },
    adminId: 'admin-1'
  };
  const response = res();

  await controller.listOrders(request, response);

  // No awaiting orders -> awaitingPaymentsForOrders should NOT be called
  assert.equal(awaitingPaymentsCalls.length, 0);
});

test('listOrders returns 500 with "Could not load orders" on repository error', async (t) => {
  t.mock.method(foodRepository, 'listOrders', async () => {
    throw new Error('DB connection failed');
  });

  const request = {
    query: { page: '1', limit: '25', filters: '{}' },
    adminId: 'admin-1'
  };
  const response = res();

  await controller.listOrders(request, response);

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, 'Could not load orders');
});