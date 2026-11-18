'use strict';

const test = require('node:test');
const assert = require('node:assert');

// --- publicTrackingController -------------------------------------------------
// Verifies the review fixes: token expiry/revocation actually enforce (the
// expiry columns are selected), rider identity comes from the profiles join,
// live rider location is populated during active delivery only.

const pool = require('../lib/database/pool');

function deliveryRow(overrides = {}) {
  return {
    id: 'd-1',
    order_id: 'ord-1',
    merchant_id: 'm-1',
    status: 'assigned',
    driver_id: 'drv-1',
    driver_fee: 9,
    pickup_photo_path: null,
    delivery_photo_path: null,
    created_at: new Date(),
    assigned_at: new Date(),
    picked_up_at: null,
    delivered_at: null,
    cancelled_at: null,
    order_code: 'FD-TEST1',
    external_order_id: 'ext-1',
    delivery_address: 'King Fahd Rd, Riyadh',
    delivery_lat: 24.713551,
    delivery_lng: 46.675319,
    delivery_street: 'King Fahd Rd',
    delivery_building: '12',
    contact_phone: '+966500000001',
    tracking_token_expires_at: null,
    tracking_token_revoked_at: null,
    merchant_name: 'Bistro',
    merchant_address: 'Olaya St',
    merchant_lat: 24.69,
    merchant_lng: 46.68,
    rider_name: 'Sara',
    vehicle_type: 'bike',
    vehicle_plate: 'ABC-123',
    ...overrides,
  };
}

function mockPool({ row = deliveryRow(), fix = { lat: 24.712, lng: 46.676, recorded_at: new Date() } } = {}) {
  pool.query = async (sql) => {
    if (sql.includes('FROM public.driver_locations')) return { rows: [fix] };
    if (sql.includes('FROM public.deliveries d')) return { rows: [row] };
    return { rows: [] };
  };
}

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const controller = require('../controllers/publicTrackingController');

test('expired tracking token is rejected (403 token_expired)', async () => {
  mockPool({ row: deliveryRow({ tracking_token_expires_at: new Date(Date.now() - 1000) }) });
  const res = fakeRes();
  await controller.getPublicTracking(
    { params: { trackingId: 'x' }, query: { token: 'tok' }, headers: {} },
    res
  );
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.error.code, 'token_expired');
});

test('revoked tracking token is rejected (403 token_revoked)', async () => {
  mockPool({ row: deliveryRow({ tracking_token_revoked_at: new Date() }) });
  const res = fakeRes();
  await controller.getPublicTracking(
    { params: { trackingId: 'x' }, query: { token: 'tok' }, headers: {} },
    res
  );
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.error.code, 'token_revoked');
});

test('active delivery exposes rider identity and live location', async () => {
  mockPool();
  const res = fakeRes();
  await controller.getPublicTracking(
    { params: { trackingId: 'x' }, query: { token: 'tok' }, headers: {} },
    res
  );
  assert.strictEqual(res.statusCode, null); // res.json() succeeded without status()
  const body = res.body;
  assert.strictEqual(body.rider.name, 'Sara');
  assert.strictEqual(body.rider.vehicle_plate, 'ABC-123');
  assert.strictEqual(body.rider_location.lat, 24.712);
  assert.strictEqual(body.rider_location.lng, 46.676);
  // Drop-off coordinates are masked to ~111m, not exact
  assert.notStrictEqual(body.dropoff.lat, 24.713551);
  assert.strictEqual(body.dropoff.lat, 24.714);
  // No money or customer PII leaks into the public DTO
  assert.strictEqual(body.subtotal, undefined);
  assert.strictEqual(body.customer_name, undefined);
});

test('terminal delivery hides rider location', async () => {
  mockPool({ row: deliveryRow({ status: 'delivered', delivered_at: new Date() }) });
  const res = fakeRes();
  await controller.getPublicTracking(
    { params: { trackingId: 'x' }, query: { token: 'tok' }, headers: {} },
    res
  );
  assert.strictEqual(res.body.rider, null);
  assert.strictEqual(res.body.rider_location, null);
  assert.strictEqual(res.body.terminal, true);
});

test('missing token is rejected (400)', async () => {
  const res = fakeRes();
  await controller.getPublicTracking(
    { params: { trackingId: 'x' }, query: {}, headers: {} },
    res
  );
  assert.strictEqual(res.statusCode, 400);
});
