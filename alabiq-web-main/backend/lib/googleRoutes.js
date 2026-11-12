// ---------------------------------------------------------------------
// Mapbox Directions API — the one place we speak to it.
//
// Lifted out of routes/route.js so the ETA layer (lib/eta.js) can ask for a
// driving duration without going back out through our own HTTP surface.
// route.js is now a thin proxy over this; both get the same key handling
// and the same "no route found" semantics.
//
// MAPBOX_ACCESS_TOKEN stays server-side. Never expose it to a client —
// the browser reaches this through /api/route, same-origin. Coordinates
// are "lng,lat" in the URL; the interface here keeps {lat,lng}.
//
// geometries=polyline (precision 5) matches the Google/OSRM-style encoded
// polyline the frontend decoder in lib/osrm.js expects.
// ---------------------------------------------------------------------
const DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';

function isPoint(p) {
  return p != null && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
}

// Ask Mapbox for the driving route between two points.
//
// Returns { ok: true, encodedPolyline, distanceMeters, durationSeconds } —
// where every field may still be null if Mapbox found no route — or
// { ok: false, reason } on a bad input, a missing key, or an upstream
// failure. NEVER throws: every caller has a usable fallback (a straight
// line on the map, a haversine estimate for an ETA) and an exception here
// would take down a page for a nicety.
async function computeRoute({ from, to }) {
  if (!isPoint(from) || !isPoint(to)) {
    return { ok: false, reason: 'invalid_coordinates' };
  }

  const apiKey = process.env.MAPBOX_ACCESS_TOKEN;
  if (!apiKey) {
    console.error('mapboxDirections: MAPBOX_ACCESS_TOKEN is not set');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const coords = `${Number(from.lng)},${Number(from.lat)};${Number(to.lng)},${Number(to.lat)}`;
    const qs = new URLSearchParams({
      geometries: 'polyline',
      overview: 'full',
      access_token: apiKey,
    });
    const upstream = await fetch(`${DIRECTIONS_URL}/${coords}?${qs}`);

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('mapbox directions error:', upstream.status, text.slice(0, 300));
      return { ok: false, reason: 'upstream_error' };
    }

    const data = await upstream.json();
    const route = data?.routes?.[0];
    if (!route?.geometry) {
      // No route found — the caller falls back to a straight line.
      return { ok: true, encodedPolyline: null, distanceMeters: null, durationSeconds: null };
    }

    return {
      ok: true,
      encodedPolyline: route.geometry,
      distanceMeters: Number.isFinite(route.distance) ? Math.round(route.distance) : null,
      durationSeconds: Number.isFinite(route.duration) ? Math.round(route.duration) : null,
    };
  } catch (err) {
    console.error('mapboxDirections error:', err.message || err);
    return { ok: false, reason: 'upstream_error' };
  }
}

module.exports = { computeRoute };
