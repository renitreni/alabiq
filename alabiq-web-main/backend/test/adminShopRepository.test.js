'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const repository = require('../repositories/adminShopRepository');

test('overview aggregates orders, stores, payment and stock counts in parallel', async (t) => {
  const query = t.mock.method(database, 'query', async (sql) => {
    if (sql.includes('FROM public.shop_orders ORDER BY')) return { rows: [{ id: 'o-1', status: 'delivered', total: 100, platform_margin_total: 10, payment_status: 'paid', created_at: new Date().toISOString() }] };
    if (sql.includes("vertical='shop'")) return { rows: [{ status: 'active', credit_used: 0, credit_limit: 500 }] };
    if (sql.includes("payment_status='awaiting'")) return { rows: [{ count: 2 }] };
    if (sql.includes('cancelled') && sql.includes('refunded') === false) return { rows: [{ count: 1 }] };
    if (sql.includes('track_stock')) return { rows: [{ count: 3 }] };
    return { rows: [] };
  });
  const result = await repository.overview();
  assert.equal(result.orders.length, 1);
  assert.equal(result.stores.length, 1);
  assert.equal(result.awaitingPayments, 2);
  assert.equal(query.mock.calls.length, 5);
});

test('insertStore pins the shop vertical and whitelists body fields', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ id: 's-1', name: 'Corner Shop' }] }));
  const row = await repository.insertStore({ name: 'Corner Shop', lat: 24.7, lng: 46.7, evil: 'drop-me' });
  assert.equal(row.id, 's-1');
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /INSERT INTO public\.merchants \(vertical,name,lat,lng\)/);
  assert.match(sql, /VALUES \('shop',\$1,\$2,\$3\)/);
  assert.deepEqual(values, ['Corner Shop', 24.7, 46.7]);
});

test('replenishStoreCredit is a compare-and-swap against the stored balance', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rowCount: 1, rows: [{ id: 'm-1' }] }));
  const applied = await repository.replenishStoreCredit({
    id: 'm-1', after: 40, status: 'active', expectedCreditUsed: 90,
  });
  assert.equal(applied, true);
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /WHERE id=\$1 AND credit_used=\$4/);
  assert.deepEqual(values, ['m-1', 40, 'active', 90]);
});

test('listOrders nests merchant, customer, delivery and item embeds', async (t) => {
  const query = t.mock.method(database, 'query', async (sql, values) => {
    // Count query
    if (sql.includes('SELECT count(*)')) {
      return { rows: [{ total: 1 }] };
    }
    // Data query
    return {
      rows: [{
        id: 'o-1', order_code: 'SH-1', status: 'pending',
        merchant_id: 'm-1', merchant_name: 'Corner Shop',
        customer_full_name: 'Sara', customer_mobile_number: '050',
        delivery_row_id: 'd-1', delivery_status: 'assigned', delivery_driver_id: 'drv-1',
        pickup_photo_path: 'p.jpg', delivery_photo_path: null,
        order_items: [{ name_snapshot: 'Rice', quantity: 2, line_total: 20, margin_total: 2 }],
      }],
    };
  });
  const result = await repository.listOrders({ status: 'pending', merchantId: 'm-1', page: 1, limit: 25 });
  // First call is count query, second is data query
  assert.equal(query.mock.calls.length, 2);
  const [dataSql, dataValues] = query.mock.calls[1].arguments;
  assert.match(dataSql, /o\.status=\$1/);
  assert.match(dataSql, /o\.merchant_id=\$2/);
  assert.match(dataSql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(dataValues, ['pending', 'm-1', 25, 0]);
  const order = result.rows[0];
  assert.deepEqual(order.merchants, { id: 'm-1', name: 'Corner Shop' });
  assert.deepEqual(order.profiles, { full_name: 'Sara', mobile_number: '050' });
  assert.equal(order.shop_deliveries.status, 'assigned');
  assert.equal(order.shop_order_items.length, 1);
  assert.equal(order.merchant_name, undefined, 'flat join aliases must not leak');
  assert.equal(result.total, 1);
  // Repository returns { rows, total }, pagination is added by controller
});

test('upsertDelivery inserts or updates on the unique order_id', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rowCount: 1, rows: [] }));
  await repository.upsertDelivery({ orderId: 'o-1', driverId: 'd-1', status: 'assigned' });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /ON CONFLICT \(order_id\) DO UPDATE/);
  assert.deepEqual(values, ['o-1', 'd-1', 'assigned']);
});

test('settlementPage pages the report window with an inclusive upper bound', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{ order_code: 'SH-9', merchant_name: 'Corner Shop' }] }));
  const rows = await repository.settlementPage({
    from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-31T00:00:00Z'), limit: 1000, offset: 0,
  });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /o\.created_at>=\$1 AND o\.created_at<=\$2/);
  assert.match(sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(values, ['2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z', 1000, 0]);
  assert.deepEqual(rows[0].merchants, { name: 'Corner Shop' });
});
