// ---------------------------------------------------------------------
// Admin-editable runtime settings (app_settings, migration 0043).
//
// The one thing that reads or writes app_settings. Everything else asks
// this module, so there is a single place where "what happens when the
// row is missing" is decided.
//
// CACHING. Values are cached for CACHE_TTL_MS and no longer. The TTL is
// not a performance tweak — a permanently cached miss is exactly what
// broke the 0019 rollout, where a process kept answering with the
// pre-migration value until someone restarted it. Anything cached here
// must expire on its own so an applied migration takes effect without a
// deploy, which is the entire point of the table.
//
// FALLBACK. If the table or the row is not there — the migration has not
// been applied yet — every getter falls back to the env-driven value in
// lib/config.js. An un-applied 0043 must change no behaviour.
// ---------------------------------------------------------------------
const appSettingsRepository = require('../repositories/appSettingsRepository');
const { config } = require('./config');

const CACHE_TTL_MS = 60 * 1000;

const cache = new Map(); // key -> { value, readAt }

// A miss is cached too, at the same TTL. Without that, a missing table
// means a failed query on every single order priced.
async function readSetting(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.readAt < CACHE_TTL_MS) return hit.value;

  let value; // undefined = no usable row, distinct from a stored json null
  try {
    const { data, error } = await appSettingsRepository.getSetting(key);
    // A missing table is an error here, not an empty result. Either way
    // the caller gets undefined and falls back.
    if (error) {
      console.error('readSetting error:', error.message || error);
    } else if (data) {
      value = data.value;
    }
  } catch (err) {
    console.error('readSetting error:', err.message || err);
  }

  cache.set(key, { value, readAt: Date.now() });
  return value;
}

// The maximum distance we will serve, in km, across BOTH rides and
// food/shop deliveries.
//
// Returns a positive number, or null for NO LIMIT. Null is a real stored
// value, not an absence: it is what 0043 seeds the row with, and it is
// how the platform ships. Callers must therefore distinguish it from the
// undefined they would get if the row were gone — which is why the
// fallback to the env default happens here and not at the call site.
async function getMaxDistanceKm() {
  const raw = await readSetting('max_distance_km');
  if (raw === undefined) {
    // Row/table missing: behave exactly as the code did before 0043.
    return config.delivery.maxRadiusKm;
  }
  if (raw === null) return null;
  const n = Number(raw);
  // A stored value that is not a usable positive number is a bug in the
  // writer, not an instruction to serve infinite distance. Fail closed
  // onto the configured default.
  return Number.isFinite(n) && n > 0 ? n : config.delivery.maxRadiusKm;
}

// Write it back. `value` is a positive number, or null for no limit.
async function setMaxDistanceKm(value, actorId = null) {
  const { error } = await appSettingsRepository.setSetting(
    'max_distance_km', value == null ? null : Number(value), actorId,
  );
  if (error) throw error;
  cache.delete('max_distance_km');
}

// Whether checkout offers STC Pay manual transfer (0044).
//
// Returns a boolean. A missing row or table reads as TRUE — the state the
// platform shipped in before the setting existed — so an un-applied 0044
// changes nothing, same rule as max_distance_km above. Only an explicit
// stored `false` hides it; anything unrecognised is treated as "leave it
// on", because failing closed here would mean silently removing a payment
// method from live customers over a bad write.
async function getStcPayEnabled() {
  const raw = await readSetting('stcpay_enabled');
  if (raw === undefined || raw === null) return true;
  return raw !== false;
}

async function setStcPayEnabled(value, actorId = null) {
  const { error } = await appSettingsRepository.setSetting('stcpay_enabled', !!value, actorId);
  if (error) throw error;
  cache.delete('stcpay_enabled');
}

// Exposed for tests, and for anything that changes a setting through a
// path other than the setters above.
function clearSettingsCache() {
  cache.clear();
}

module.exports = {
  getMaxDistanceKm,
  setMaxDistanceKm,
  getStcPayEnabled,
  setStcPayEnabled,
  clearSettingsCache,
  CACHE_TTL_MS,
};
