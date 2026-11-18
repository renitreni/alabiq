'use strict';

require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildManifest } = require('../controllers/food/restaurantsController');

function merchant(overrides = {}) {
  return {
    public_hash: 'abc123def456',
    name: 'Shawarma House',
    brand_color: '#b91c1c',
    logo_url: null,
    ...overrides,
  };
}

test('buildManifest pins start_url and scope to the restaurant app subtree', () => {
  const m = buildManifest(merchant());
  assert.equal(m.start_url, '/app/abc123def456');
  assert.equal(m.scope, '/app/abc123def456');
  assert.equal(m.display, 'standalone');
  assert.equal(m.name, 'Shawarma House');
  assert.equal(m.short_name, 'Shawarma Hou');
});

test('buildManifest uses the brand color when it is a valid hex color', () => {
  assert.equal(buildManifest(merchant()).theme_color, '#b91c1c');
  for (const bad of ['red', '#fff', '#12345g', '', null, undefined]) {
    assert.equal(buildManifest(merchant({ brand_color: bad })).theme_color, '#f97316', `fallback for ${bad}`);
  }
});

test('buildManifest uses the restaurant PNG logo as primary icon and always keeps platform fallbacks', () => {
  const withLogo = buildManifest(merchant({ logo_url: 'https://cdn.example.com/logo.png' }));
  assert.equal(withLogo.icons[0].src, 'https://cdn.example.com/logo.png');
  assert.equal(withLogo.icons.at(-1).purpose, 'maskable');

  const noLogo = buildManifest(merchant());
  assert.ok(noLogo.icons.every((i) => i.src.startsWith('/alabiq-icon')));
  assert.ok(noLogo.icons.some((i) => i.purpose === 'maskable'));

  // Non-PNG logos (jpeg/webp) cannot be size-declared honestly — fall back.
  const jpegLogo = buildManifest(merchant({ logo_url: 'https://cdn.example.com/logo.jpg' }));
  assert.ok(jpegLogo.icons.every((i) => i.src.startsWith('/alabiq-icon')));
});

test('buildManifest truncates long names to manifest-friendly lengths', () => {
  const m = buildManifest(merchant({ name: 'The Extraordinarily Long Named Middle Eastern Grill & Cafe Palace' }));
  assert.ok(m.name.length <= 45);
  assert.ok(m.short_name.length <= 12);
});
