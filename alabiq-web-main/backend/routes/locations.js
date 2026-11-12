const express = require('express');
const router = express.Router();
const {
  locationSearchLimiter,
  locationReverseLimiter,
  locationNearbyLimiter,
} = require('../middleware/rateLimiters');
const { placeFromMapboxReverse } = require('../lib/geo');

// ---------------------------------------------------------------------
// Location endpoints backed by Mapbox (replaces the old Google Maps
// Platform proxy):
//   GET  /search?q=&lat=&lng=&token=   -> Search Box suggest     (predictions, NO coords)
//   GET  /details?id=&token=           -> Search Box retrieve    (coords for a prediction)
//   GET  /reverse?lat=&lng=            -> Geocoding v5 reverse   (coords -> address)
//   GET  /nearby?lat=&lng=&radius=     -> Search Box category    (POIs around a pin)
//
// The MAPBOX_ACCESS_TOKEN stays server-side; the browser calls these
// same-origin under /api. Suggest + retrieve share a client-supplied
// `token` (session token) so the keystrokes bill as one cheap session.
//
// Coordinates are always "lng,lat" in Mapbox URLs — the public API this
// exposes keeps the frontend's {lat,lng} shape everywhere.
// ---------------------------------------------------------------------
const RIYADH = { lat: 24.7136, lng: 46.6753 };
const MAPBOX_BASE = 'https://api.mapbox.com';
// Category slugs for /nearby (Search Box category search taxonomy). A
// category that the account cannot serve fails its own request only —
// the others still come back.
const NEARBY_CATEGORIES = [
  'restaurant', 'cafe', 'gas_station', 'pharmacy', 'hospital',
  'bank', 'atm', 'parking', 'supermarket', 'convenience_store',
  'mall', 'lodging',
];

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function apiKey() {
  return process.env.MAPBOX_ACCESS_TOKEN || '';
}

// Search Box REQUIRES a session_token on both suggest and retrieve. The
// frontend sends one (so keystrokes bill as one session); when a caller
// omits it we mint a throwaway one rather than fail the call.
const { randomUUID } = require('crypto');
function sessionToken(provided) {
  const t = String(provided || '').trim();
  if (t) return t;
  return typeof randomUUID === 'function' ? randomUUID() : `sm-${Date.now()}-${Math.random()}`;
}

async function mapboxGet(path, params) {
  const qs = new URLSearchParams({ ...params, access_token: apiKey() });
  const res = await fetch(`${MAPBOX_BASE}${path}?${qs}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mapbox ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// --- Tiny in-memory TTL cache ------------------------------------------------
// The location picker is chatty (reverse/nearby fire on map moves, search on
// typing). Caching identical lookups for a minute cuts BOTH our own rate-limit
// pressure and the number of billable Mapbox calls.
const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map(); // key -> { at, value }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit); // refresh LRU order
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

// Round a coord for cache keys (~11m at 4dp, ~110m at 3dp).
const round = (n, dp) => Number(n).toFixed(dp);

// --- Shape helpers -------------------------------------------------------------
// A Search Box feature (suggest/retrieve/category all share this core).
function featureView(feature, fallbackType) {
  const coords = (feature && feature.geometry && feature.geometry.coordinates) || [];
  const props = (feature && feature.properties) || {};
  return {
    id: String(props.mapbox_id || ''),
    name: props.name || '',
    address: props.full_address || props.place_formatted || '',
    lat: num(coords[1]),
    lng: num(coords[0]),
    type: props.feature_type || fallbackType || 'place',
  };
}

// --- /search : Search Box suggest — predictions only (no coords) -------------
router.get('/search', locationSearchLimiter, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ results: [] });
    if (!apiKey()) return res.status(502).json({ error: 'Location search is not configured' });

    const lat = num(req.query.lat, RIYADH.lat);
    const lng = num(req.query.lng, RIYADH.lng);
    const clientToken = String(req.query.token || '');
    const token = sessionToken(clientToken);

    // Session-token suggestions are billed as part of the session, so they
    // must not be cached across sessions; cache only the coordinate-biased
    // query text.
    const cacheKey = `s:${q.toLowerCase()}:${round(lat, 2)}:${round(lng, 2)}`;
    if (!clientToken) {
      const cached = cacheGet(cacheKey);
      if (cached) return res.json({ results: cached });
    }

    const data = await mapboxGet('/search/searchbox/v1/suggest', {
      q,
      language: 'en',
      proximity: `${lng},${lat}`,
      session_token: token,
    });
    const results = (data.suggestions || [])
      .map((s) => ({
        id: s.mapbox_id || '',
        name: s.name || 'Location',
        address: s.full_address || s.place_formatted || s.address || '',
        lat: null, // coords come from /details on selection
        lng: null,
        type: s.feature_type || 'place',
      }))
      .filter((r) => r.id);

    if (!clientToken) cacheSet(cacheKey, results);
    return res.json({ results });
  } catch (err) {
    console.error('location search error:', err.message || err);
    return res.status(502).json({ error: 'Location search is temporarily unavailable' });
  }
});

// --- /details : Search Box retrieve — resolve coords for a prediction ----------
router.get('/details', locationSearchLimiter, async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    if (!apiKey()) return res.status(502).json({ error: 'Location lookup is not configured' });

    const token = sessionToken(req.query.token);
    const cacheKey = `d:${id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ place: cached });

    const data = await mapboxGet(
      `/search/searchbox/v1/retrieve/${encodeURIComponent(id)}`,
      { session_token: token }
    );
    const feature = (data.features || [])[0];
    if (!feature) return res.status(404).json({ error: 'Could not read this location' });
    const place = featureView(feature);
    cacheSet(cacheKey, place);
    return res.json({ place });
  } catch (err) {
    console.error('location details error:', err.message || err);
    return res.status(502).json({ error: 'Could not read this location' });
  }
});

// --- /reverse : Geocoding v5 reverse — coords -> address ---------------------
router.get('/reverse', locationReverseLimiter, async (req, res) => {
  try {
    const lat = num(req.query.lat);
    const lng = num(req.query.lng);
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng are required' });
    if (!apiKey()) return res.status(502).json({ error: 'Location lookup is not configured' });

    const cacheKey = `r:${round(lat, 4)}:${round(lng, 4)}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ place: cached });

    const data = await mapboxGet(`/geocoding/v5/mapbox.places/${lng},${lat}.json`, {
      language: 'en',
    });
    const place = placeFromMapboxReverse(data.features, lat, lng);
    if (!place) return res.status(404).json({ error: 'No address found for this location' });
    cacheSet(cacheKey, place);
    return res.json({ place });
  } catch (err) {
    console.error('location reverse error:', err.message || err);
    return res.status(502).json({ error: 'Could not read this location address' });
  }
});

// --- /nearby : Search Box category search — POIs around a pin ----------------
router.get('/nearby', locationNearbyLimiter, async (req, res) => {
  try {
    const lat = num(req.query.lat);
    const lng = num(req.query.lng);
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng are required' });
    if (!apiKey()) return res.status(502).json({ error: 'Nearby places are not configured' });

    // radius is accepted for API compatibility; Search Box category search
    // ranks by proximity instead of hard-clipping to a circle.
    clamp(num(req.query.radius, 1200), 100, 3000);

    const cacheKey = `n:${round(lat, 3)}:${round(lng, 3)}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ places: cached });

    const settled = await Promise.allSettled(
      NEARBY_CATEGORIES.map((category) =>
        mapboxGet(`/search/searchbox/v1/category/${category}`, {
          proximity: `${lng},${lat}`,
          language: 'en',
          limit: 10,
        }).then((data) => ({ category, features: data.features || [] }))
      )
    );

    const seen = new Set();
    const places = [];
    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') continue; // one dead category must not kill the rest
      for (const feature of outcome.value.features) {
        const place = featureView(feature, outcome.value.category);
        if (place.lat == null || place.lng == null || !place.id || seen.has(place.id)) continue;
        seen.add(place.id);
        places.push(place);
        if (places.length >= 20) break;
      }
      if (places.length >= 20) break;
    }

    cacheSet(cacheKey, places);
    return res.json({ places });
  } catch (err) {
    console.error('nearby places error:', err.message || err);
    return res.status(502).json({ error: 'Nearby places are temporarily unavailable' });
  }
});

module.exports = router;
