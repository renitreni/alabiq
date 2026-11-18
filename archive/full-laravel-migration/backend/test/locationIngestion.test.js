'use strict';

const test = require('node:test');
const assert = require('node:assert');
const locationIngestion = require('../lib/locationIngestion');

test('locationIngestion exports expected functions', () => {
  const expected = [
    'ingestLocation',
    'getCurrentLocation',
    'getNearbyRiders',
    'removeDriverFromGeo',
    'sampleLocationHistory',
    'getDriverLocationForTracking',
    'validateLocationPayload',
    'isDispatchReady',
    'isPlausibleJump',
  ];
  for (const fn of expected) {
    assert.strictEqual(typeof locationIngestion[fn], 'function', `Missing function: ${fn}`);
  }
});

test('validateLocationPayload accepts valid payload', () => {
  const payload = {
    lat: 24.7136,
    lng: 46.6753,
    recorded_at: Date.now(),
    accuracy: 10,
    speed_kmh: 30,
    heading: 90,
  };
  const result = locationIngestion.validateLocationPayload(payload);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('validateLocationPayload rejects invalid lat/lng', () => {
  const payload = { lat: 100, lng: 46.6753, recorded_at: Date.now() };
  const result = locationIngestion.validateLocationPayload(payload);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('latitude')));
});

test('validateLocationPayload rejects missing recorded_at', () => {
  const payload = { lat: 24.7136, lng: 46.6753 };
  const result = locationIngestion.validateLocationPayload(payload);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('recorded_at')));
});

test('validateLocationPayload rejects future timestamp', () => {
  const payload = { lat: 24.7136, lng: 46.6753, recorded_at: Date.now() + 10 * 60 * 1000 };
  const result = locationIngestion.validateLocationPayload(payload);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('future')));
});

test('validateLocationPayload rejects too old timestamp', () => {
  const payload = { lat: 24.7136, lng: 46.6753, recorded_at: Date.now() - 10 * 60 * 1000 };
  const result = locationIngestion.validateLocationPayload(payload);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('old')));
});

test('isDispatchReady returns true for good accuracy', () => {
  assert.strictEqual(locationIngestion.isDispatchReady(50), true);
  assert.strictEqual(locationIngestion.isDispatchReady(100), true);
});

test('isDispatchReady returns false for poor accuracy', () => {
  assert.strictEqual(locationIngestion.isDispatchReady(150), false);
  assert.strictEqual(locationIngestion.isDispatchReady(undefined), false);
  assert.strictEqual(locationIngestion.isDispatchReady(null), false);
});

test('isPlausibleJump returns true for no history', () => {
  const newFix = { lat: 24.7136, lng: 46.6753, recorded_at: Date.now() };
  assert.strictEqual(locationIngestion.isPlausibleJump(null, newFix), true);
});

test('isPlausibleJump detects implausible speed', () => {
  const lastFix = { lat: 24.7136, lng: 46.6753, recorded_at: Date.now() - 60000 }; // 1 min ago
  const newFix = { lat: 30.7136, lng: 46.6753, recorded_at: Date.now() }; // ~666 km in 1 min = 40000 km/h
  assert.strictEqual(locationIngestion.isPlausibleJump(lastFix, newFix), false);
});

test('isPlausibleJump allows plausible movement', () => {
  const lastFix = { lat: 24.7136, lng: 46.6753, recorded_at: Date.now() - 60000 }; // 1 min ago
  const newFix = { lat: 24.7236, lng: 46.6853, recorded_at: Date.now() }; // ~1.5 km in 1 min = 90 km/h
  assert.strictEqual(locationIngestion.isPlausibleJump(lastFix, newFix), true);
});
