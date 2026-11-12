import test from 'node:test';
import assert from 'node:assert';
import { PRODUCTION_API_BASE, resolveApiBase } from '../src/portal/lib/apiConfig.js';

test('production defaults to the deployed Alabiq API, never localhost', () => {
  assert.strictEqual(PRODUCTION_API_BASE, 'https://api.alabiq.com');
  assert.strictEqual(resolveApiBase({ dev: false, configured: '' }), 'https://api.alabiq.com');
});

test('staging may explicitly override the API and trailing slashes are normalized', () => {
  assert.strictEqual(
    resolveApiBase({ dev: false, configured: 'https://staging-api.alabiq.com/' }),
    'https://staging-api.alabiq.com'
  );
});

test('development uses the Vite same-origin proxy', () => {
  assert.strictEqual(resolveApiBase({ dev: true, configured: 'https://api.alabiq.com' }), '');
});

test('Docker single-origin builds use the frontend origin for API requests', () => {
  assert.strictEqual(resolveApiBase({ dev: false, configured: '/' }), '');
});
