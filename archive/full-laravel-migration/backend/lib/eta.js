// ---------------------------------------------------------------------
// Customer-facing ETAs.
//
// Until now every ETA on the platform was geo.etaMinutes(): haversine
// distance divided by a hardcoded 30 km/h. That ignores roads, traffic and
// the fact that a 2 km straight line across a wadi is a 9 km drive. Google
// Routes already tells us the real driving duration and we already pay for
// the call — we were throwing the number away.
//
// TWO RULES THIS MODULE EXISTS TO ENFORCE:
//
//   1. It must never become a hard dependency. Google can rate-limit, the
//      key can be unset in a dev environment, the network can fail. Every
//      path falls back to the haversine estimate rather than erroring — a
//      slightly wrong ETA beats a tracking page that will not load.
//
//   2. It must not bill per poll. Tracking pages poll every 8 seconds and
//      several people can watch one order. Uncached, one customer watching
//      for ten minutes is ~75 Routes calls. The cache below collapses that
//      to ~10.
//
// THE 45-MINUTE FLOOR IS FOR DELIVERIES ONLY. Google measures the road leg;
// a food order also has to be cooked and a shop order packed, and neither
// is visible to a routing API. Rides have no such stage, so flooring them
// would promise 45 minutes for a 20-minute airport run — call
// travelEtaMinutes directly for those.
// ---------------------------------------------------------------------
const { config } = require('./config');
const { computeRoute } = require('./googleRoutes');
const { etaMinutes: haversineEtaMinutes, haversineKm } = require('./geo');

// --- cache -----------------------------------------------------------
// In-memory is correct here: one PM2 process serves the whole app (Vercel
// is retired), the same reasoning that makes the in-memory rate limiter and
// idempotency store correct. Keys round coordinates to ~110 m, which is far
// finer than the ETA's own accuracy but coarse enough that a rider's 4-second
// GPS jitter keeps hitting the same entry.
const cache = new Map();

function cacheKey(from, to) {
  const r = (n) => Number(n).toFixed(3);
  return `${r(from.lat)},${r(from.lng)}->${r(to.lat)},${r(to.lng)}`;
}

// Bounded so a long-running process cannot grow the map without limit.
const MAX_ENTRIES = 500;

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache(key, value) {
  if (cache.size >= MAX_ENTRIES) {
    // Oldest insertion first — Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + config.delivery.etaCacheMs });
}

function isPoint(p) {
  return p != null && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
}

// --- the real driving time -------------------------------------------
// Minutes from `from` to `to`, or null when neither Google nor haversine can
// answer (i.e. a coordinate is missing). Never throws.
async function travelEtaMinutes(from, to) {
  if (!isPoint(from) || !isPoint(to)) return null;

  const key = cacheKey(from, to);
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  // The fallback is computed up front so a Google failure costs nothing extra.
  const fallback = haversineEtaMinutes(haversineKm(from, to));

  const route = await computeRoute({ from, to });
  const minutes =
    route.ok && Number.isFinite(route.durationSeconds)
      ? Math.max(1, Math.round(route.durationSeconds / 60))
      : fallback;

  // Only a real Google answer is worth caching for the full TTL. Caching a
  // fallback for 60s would keep serving the guess long after Google recovers,
  // so those get a short window that still absorbs a poll burst.
  if (route.ok && Number.isFinite(route.durationSeconds)) {
    writeCache(key, minutes);
  } else {
    cache.set(key, { value: minutes, expiresAt: Date.now() + 10000 });
  }

  return minutes;
}

// --- what the customer is shown --------------------------------------
// Turn a raw travel time into the displayed delivery band, applying the
// floor. Pure, so the floor is testable without a network call.
//
//   22 -> { min: 45, max: 50, label: '45 - 50 mins' }
//   62 -> { min: 62, max: 67, label: '62 - 67 mins' }
//   null -> { min: null, max: null, label: null }
function deliveryEtaBand(travelMinutes) {
  if (travelMinutes == null || !Number.isFinite(Number(travelMinutes))) {
    return { min: null, max: null, label: null };
  }
  const min = Math.max(Math.round(Number(travelMinutes)), config.delivery.minEtaMinutes);
  const max = min + config.delivery.etaBandMinutes;
  return { min, max, label: `${min} - ${max} mins` };
}

// Convenience for the delivery verticals: route + floor in one call.
async function deliveryEta(from, to) {
  return deliveryEtaBand(await travelEtaMinutes(from, to));
}

// Testing/ops only — lets a test assert cache behaviour deterministically.
function _clearEtaCache() {
  cache.clear();
}

module.exports = { travelEtaMinutes, deliveryEtaBand, deliveryEta, _clearEtaCache };
