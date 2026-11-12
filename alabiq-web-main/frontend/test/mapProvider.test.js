import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMapConfiguration } from '../src/portal/lib/mapProvider.js';

test('Google remains the default provider for existing deployments', () => {
  const result = resolveMapConfiguration({
    VITE_GOOGLE_MAPS_BROWSER_KEY: 'browser-key',
    VITE_GOOGLE_MAP_ID: 'map-id',
  });
  assert.deepEqual(result, { provider: 'google', error: null });
});

test('Mapbox mode requires only its public access token', () => {
  const result = resolveMapConfiguration({
    VITE_MAP_PROVIDER: ' MAPBOX ',
    VITE_MAPBOX_ACCESS_TOKEN: 'pk.example',
  });
  assert.deepEqual(result, { provider: 'mapbox', error: null });
});

test('inactive provider credentials are not required', () => {
  const google = resolveMapConfiguration({
    VITE_MAP_PROVIDER: 'google',
    VITE_GOOGLE_MAPS_BROWSER_KEY: 'browser-key',
    VITE_GOOGLE_MAP_ID: 'map-id',
  });
  const mapbox = resolveMapConfiguration({
    VITE_MAP_PROVIDER: 'mapbox',
    VITE_MAPBOX_ACCESS_TOKEN: 'pk.example',
  });
  assert.equal(google.error, null);
  assert.equal(mapbox.error, null);
});

test('missing selected-provider credentials return a useful error', () => {
  assert.match(resolveMapConfiguration({ VITE_MAP_PROVIDER: 'mapbox' }).error, /MAPBOX_ACCESS_TOKEN/);
  assert.match(resolveMapConfiguration({ VITE_MAP_PROVIDER: 'google' }).error, /GOOGLE_MAPS_BROWSER_KEY/);
  assert.match(resolveMapConfiguration({ VITE_MAP_PROVIDER: 'google' }).error, /GOOGLE_MAP_ID/);
});

test('Mapbox mode rejects a secret token before loading the SDK', () => {
  const result = resolveMapConfiguration({
    VITE_MAP_PROVIDER: 'mapbox',
    VITE_MAPBOX_ACCESS_TOKEN: 'sk.secret-must-stay-server-side',
  });
  assert.match(result.error, /public Mapbox token/);
});

test('unknown providers fail instead of silently loading Google', () => {
  const result = resolveMapConfiguration({ VITE_MAP_PROVIDER: 'other' });
  assert.equal(result.provider, null);
  assert.match(result.error, /google.*mapbox/i);
});
