'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../lib/database/pool');
const foodCart = require('../controllers/food/cartController');
const shopCart = require('../controllers/shop/cartController');

test('food cart summary joins live menu data in PostgreSQL', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{
    id: 'line-1', quantity: 2, unit_price: '30.00', size: null, menu_item_id: 'menu-1',
    menu_items: { id: 'menu-1', name: 'Lunch', price: '35.00', image_url: null,
      is_available: true, item_type: 'meal_package', size_options: [] },
  }] }));
  const summary = await foodCart.buildCartSummary({ id: 'cart-1', merchant_id: 'merchant-1' });
  assert.equal(summary.items[0].name, 'Lunch');
  assert.equal(summary.items[0].unitPrice, 35);
  assert.equal(summary.items[0].lineTotal, 70);
  assert.match(query.mock.calls[0].arguments[0], /LEFT JOIN public\.menu_items/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['cart-1']);
});

test('shop cart summary joins live product and variant data without leaking stock counts', async (t) => {
  const query = t.mock.method(database, 'query', async () => ({ rows: [{
    id: 'line-2', quantity: 1, unit_price: '20.00', product_id: 'product-1', variant_id: null,
    products: { id: 'product-1', name: 'Soap', price: '20.00', net_price: null, image_url: null,
      is_available: true, unit: 'piece', brand: null, track_stock: false, stock_quantity: 0,
      low_stock_threshold: 2 },
    product_variants: null,
  }] }));
  const summary = await shopCart.buildCartSummary({ id: 'cart-2', merchant_id: 'merchant-2' });
  assert.equal(summary.items[0].name, 'Soap');
  assert.equal(summary.items[0].isAvailable, true);
  assert.equal('stock_quantity' in summary.items[0], false);
  assert.match(query.mock.calls[0].arguments[0], /LEFT JOIN public\.product_variants/);
  assert.deepEqual(query.mock.calls[0].arguments[1], ['cart-2']);
});
