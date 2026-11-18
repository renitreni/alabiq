require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Replace the repository before loading the service so tests never open a socket.
const repositoryPath = require.resolve('../repositories/appSettingsRepository');

let nextResult = { data: null, error: null };

require.cache[repositoryPath] = {
  id: repositoryPath,
  filename: repositoryPath,
  loaded: true,
  paths: [],
  exports: {
    getSetting: async () => nextResult,
    setSetting: async () => ({ data: null, error: null }),
  },
};

const { getMaxDistanceKm, getStcPayEnabled, clearSettingsCache } = require('../lib/settings');
const { config } = require('../lib/config');

function given(result) {
  nextResult = result;
  clearSettingsCache();
}

test('a stored null means no limit', async () => {
  // The state 0043 seeds, and what the admin "No limit" toggle writes.
  // Falling back to the env default here would quietly restore the cap
  // the setting exists to remove.
  given({ data: { value: null }, error: null });
  assert.equal(await getMaxDistanceKm(), null);
});

test('a stored number is used as the limit', async () => {
  given({ data: { value: 30 }, error: null });
  assert.equal(await getMaxDistanceKm(), 30);
});

test('a missing row falls back to the configured default', async () => {
  // 0043 not applied yet: the code must behave exactly as it did before,
  // so an un-run migration is never itself a behaviour change.
  given({ data: null, error: null });
  assert.equal(await getMaxDistanceKm(), config.delivery.maxRadiusKm);
});

test('a missing table falls back to the configured default', async () => {
  given({ data: null, error: { message: 'relation "app_settings" does not exist' } });
  assert.equal(await getMaxDistanceKm(), config.delivery.maxRadiusKm);
});

test('an unusable stored value fails closed onto the default', async () => {
  // A negative, zero or non-numeric value is a bug in the writer. Reading
  // it as "no limit" would turn a bad write into an uncapped platform.
  for (const bad of [0, -5, 'abc', {}]) {
    given({ data: { value: bad }, error: null });
    assert.equal(
      await getMaxDistanceKm(),
      config.delivery.maxRadiusKm,
      `value ${JSON.stringify(bad)} should fall back`
    );
  }
});

test('the answer is cached, and the cache can be cleared', async () => {
  given({ data: { value: 30 }, error: null });
  assert.equal(await getMaxDistanceKm(), 30);

  // Changing the underlying row without clearing must NOT be picked up
  // immediately — that is what makes this a cache.
  nextResult = { data: { value: 99 }, error: null };
  assert.equal(await getMaxDistanceKm(), 30);

  // ...and it must be picked up once the cache is dropped. The TTL is what
  // stops a process serving a pre-migration answer until someone restarts
  // it, which is the trap 0019 fell into.
  clearSettingsCache();
  assert.equal(await getMaxDistanceKm(), 99);
});

// --- STC Pay visibility (0044) ---------------------------------------
//
// The direction of the fallback is the whole point: this switch controls
// whether a PAYMENT METHOD is offered, so every uncertain case must leave
// it ON. Failing closed here would silently remove a payment method from
// live customers because of a missing row or a bad write.

test('a missing row leaves STC Pay ON', async () => {
  // The state before 0044 is pasted. Applying the code without the SQL
  // must change nothing at all.
  given({ data: null, error: null });
  assert.equal(await getStcPayEnabled(), true);
});

test('a missing table leaves STC Pay ON', async () => {
  given({ data: null, error: { message: 'relation "app_settings" does not exist' } });
  assert.equal(await getStcPayEnabled(), true);
});

test('a stored false hides STC Pay', async () => {
  // The only thing that turns it off, and the only thing that should.
  given({ data: { value: false }, error: null });
  assert.equal(await getStcPayEnabled(), false);
});

test('a stored true shows STC Pay', async () => {
  given({ data: { value: true }, error: null });
  assert.equal(await getStcPayEnabled(), true);
});

test('a stored json null leaves STC Pay ON', async () => {
  // Distinct from max_distance_km, where null is a meaningful "no limit".
  // Here there is no third state, so null is just an unset row.
  given({ data: { value: null }, error: null });
  assert.equal(await getStcPayEnabled(), true);
});

test('an unrecognised stored value leaves STC Pay ON', async () => {
  // A bad write must not take a payment method away from customers.
  given({ data: { value: 'no' }, error: null });
  assert.equal(await getStcPayEnabled(), true);
});
