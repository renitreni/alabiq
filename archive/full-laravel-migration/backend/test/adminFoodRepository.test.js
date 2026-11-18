'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/adminFoodRepository');

test('overview returns order rows plus separate exact counts', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => {
    if (sql === 'SELECT status,platform_margin_total,total FROM public.orders') return { rows: [{ status: 'delivered', platform_margin_total: 5, total: 55 }], rowCount: 1 };
    if (sql.includes('created_at>=$1')) return { rows: [{ count: 4 }] };
    if (sql.includes("vertical='food'")) return { rows: [{ status: 'active', credit_used: 10, credit_limit: 500 }] };
    if (sql.includes("payment_status='awaiting'")) return { rows: [{ count: 2 }] };
    if (sql.includes("payment_status='paid'")) return { rows: [{ count: 1 }] };
    return { rows: [] };
  });
  const result = await repository.overview({ todayStart: '2026-10-15T00:00:00.000Z' });
  assert.equal(result.totalOrders, 1);
  assert.equal(result.todayOrders, 4);
  assert.equal(result.merchants.length, 1);
  assert.equal(result.pendingPayments, 2);
  assert.equal(result.refundsOwed, 1);
  assert.equal(query.mock.calls.length, 5);
});

test('insertMerchant pins the food vertical and whitelists body fields', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 'm-1', name: 'Bistro' }] }));
  const row = await repository.insertMerchant({ name: 'Bistro', lat: 24.7, lng: 46.7, owner_id: 'nope' });
  assert.equal(row.id, 'm-1');
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /INSERT INTO public\.merchants \(vertical,name,lat,lng\)/);
  assert.match(sql, /VALUES \('food',\$1,\$2,\$3\)/);
  assert.deepEqual(values, ['Bistro', 24.7, 46.7]);
});

test('insertItem JSON-encodes size_options for the jsonb column', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 'i-1', name: 'Milk Tea' }] }));
  await repository.insertItem('m-1', {
    name: 'Milk Tea', price: 12, size_options: [{ id: 'l', label: 'Large', price: 15, enabled: true }],
  });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /INSERT INTO public\.menu_items \(merchant_id,name,price,size_options\)/);
  assert.deepEqual(values.slice(0, 3), ['m-1', 'Milk Tea', 12]);
  assert.equal(typeof values[3], 'string');
  assert.deepEqual(JSON.parse(values[3]), [{ id: 'l', label: 'Large', price: 15, enabled: true }]);
});

test('listOrders nests merchant, customer, delivery-with-driver and items', async (t) => {
  const query = t.mock.method(database, 'query', async (sql, values) => {
    // Count query
    if (sql.includes('SELECT count(*)')) {
      return { rows: [{ total: 1 }] };
    }
    // Data query
    return {
      rows: [{
        id: 'o-1', order_code: 'FD-1', status: 'accepted',
        merchant_id: 'm-1', merchant_name: 'Bistro',
        customer_full_name: 'Ali', customer_mobile_number: '055',
        delivery_row_id: 'd-1', delivery_driver_id: 'drv-1', delivery_status: 'picked_up',
        pickup_photo_path: 'a.jpg', delivery_photo_path: 'b.jpg', driver_full_name: 'Rider Ray',
        order_items: [{ name_snapshot: 'Meal', size_snapshot: 'L', quantity: 1, line_total: 30 }],
      }],
    };
  });
  const result = await repository.listOrders({ status: 'accepted', paymentStatus: null, page: 1, limit: 25 });
  // First call is count query, second is data query
  assert.equal(query.mock.calls.length, 2);
  const [dataSql, dataValues] = query.mock.calls[1].arguments;
  assert.match(dataSql, /o\.status=\$1/);
  assert.match(dataSql, /LIMIT \$2 OFFSET \$3/);
  assert.deepEqual(dataValues, ['accepted', 25, 0]);
  const order = result.rows[0];
  assert.deepEqual(order.merchants, { id: 'm-1', name: 'Bistro' });
  assert.deepEqual(order.deliveries.profiles, { full_name: 'Rider Ray' });
  assert.equal(order.order_items.length, 1);
  assert.equal(order.merchant_name, undefined, 'flat join aliases must not leak');
  assert.equal(result.total, 1);
  // Repository returns { rows, total }, pagination is added by controller
});

test('promoteAwaitingPayments reports how many proof rows were promoted', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rowCount: 2, rows: [{ id: 'p-1' }, { id: 'p-2' }] }));
  const promoted = await repository.promoteAwaitingPayments('o-1');
  assert.equal(promoted, 2);
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /UPDATE public\.order_payments SET status='paid' WHERE order_id=\$1 AND status='awaiting'/);
  assert.deepEqual(values, ['o-1']);
});

test('settlementPage keeps refunded rows out of the status filter drop', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [] }));
  await repository.settlementPage({
    from: new Date('2026-01-01T00:00:00Z'), toExclusive: new Date('2026-02-01T00:00:00Z'), limit: 1000, offset: 2000,
  });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /o\.created_at>=\$1 AND o\.created_at<\$2/);
  assert.match(sql, /o\.status NOT IN \('pending','cancelled','rejected'\) OR o\.payment_status='refunded'/);
  assert.deepEqual(values, ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', 1000, 2000]);
});

test('replenishMerchantCredit is a compare-and-swap against the stored balance', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rowCount: 0, rows: [] }));
  const applied = await repository.replenishMerchantCredit({
    id: 'm-1', newUsed: 10, newStatus: 'active', expectedCreditUsed: 300,
  });
  assert.equal(applied, false);
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /WHERE id=\$1 AND credit_used=\$4/);
  assert.deepEqual(values, ['m-1', 10, 'active', 300]);
});
