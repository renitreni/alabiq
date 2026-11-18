import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ESSENTIAL_STORAGE,
  PREFERENCE_STORAGE,
  clearPreferenceStorage,
} from '../src/portal/lib/deviceStorage.js';

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(jsx?|tsx?)$/.test(name) && !p.endsWith('deviceStorage.js') ? [p] : [];
  });
}

function memoryStorage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i],
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}

test('every listed app key is still used somewhere in src', () => {
  const src = sourceFiles(fileURLToPath(new URL('../src', import.meta.url)))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  for (const { key } of [...ESSENTIAL_STORAGE, ...PREFERENCE_STORAGE]) {
    if (key.startsWith('mapbox.')) continue;
    assert.ok(src.includes(`'${key}`) || src.includes(`\`${key}`), `${key} not found in src`);
  }
});

test('clearing preferences removes preference keys and keeps sign in', () => {
  const storage = memoryStorage({
    sm_api_session: 'token',
    sm_pending_profile: '{}',
    sm_food_favorites: '[]',
    sm_sound_prefs: '{}',
    'sm_push_prompt_dismissed:user-1': 'true',
    'sm_push_prompt_dismissed:user-2': 'true',
  });
  clearPreferenceStorage(storage);
  assert.deepEqual(storage.keys().sort(), ['sm_api_session', 'sm_pending_profile']);
});
