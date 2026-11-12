import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOrders } from '../src/portal/lib/ordersResponse.js';

test('extractOrders uses res.data when res.orders is absent (fixes the bug where backend returns { data: [...] })', () => {
  const res = { data: [{ id: 1 }, { id: 2 }] };
  assert.deepEqual(extractOrders(res), [{ id: 1 }, { id: 2 }]);
});

test('extractOrders uses res.orders when present (backward compat, matches FoodAdmin/ShopAdmin)', () => {
  const res = { orders: [{ id: 3 }] };
  assert.deepEqual(extractOrders(res), [{ id: 3 }]);
});

test('extractOrders prefers res.orders over res.data when both present', () => {
  const res = { orders: [{ id: 'a' }], data: [{ id: 'b' }] };
  assert.deepEqual(extractOrders(res), [{ id: 'a' }]);
});

test('extractOrders returns empty array for null/undefined input', () => {
  assert.deepEqual(extractOrders(null), []);
  assert.deepEqual(extractOrders(undefined), []);
});

test('extractOrders returns empty array for empty object', () => {
  assert.deepEqual(extractOrders({}), []);
});

test('extractOrders returns empty array for non-array values', () => {
  assert.deepEqual(extractOrders({ orders: null }), []);
  assert.deepEqual(extractOrders({ data: 'not-an-array' }), []);
  assert.deepEqual(extractOrders({ orders: 123 }), []);
});