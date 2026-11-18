const express = require('express');
const router = express.Router();
const { routeLimiter } = require('../middleware/rateLimiters');
const { computeRoute } = require('../lib/googleRoutes');

// ---------------------------------------------------------------------
// Driving-route proxy backed by the Mapbox Directions API.
// Replaces the old self-hosted OSRM proxy. The MAPBOX_ACCESS_TOKEN stays
// server-side; the browser calls this same-origin under /api. Returns the
// encoded polyline + distance/duration; the frontend (lib/osrm.js) decodes
// the polyline and falls back to a straight line if this is unavailable.
//
// The Mapbox call itself lives in lib/googleRoutes.js so lib/eta.js can
// reuse it without a loopback HTTP request. This file is only the HTTP
// shape: parse, delegate, map the failure onto a status code.
//
//   GET /api/route?from=LAT,LNG&to=LAT,LNG
// ---------------------------------------------------------------------
function parseLatLng(value) {
  if (!value) return null;
  const [lat, lng] = String(value).split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

router.get('/', routeLimiter, async (req, res) => {
  const from = parseLatLng(req.query.from);
  const to = parseLatLng(req.query.to);
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to are required as "lat,lng"' });
  }

  const result = await computeRoute({ from, to });
  if (!result.ok) {
    return res
      .status(502)
      .json({ error: result.reason === 'not_configured' ? 'Routing service not configured' : 'Routing service unavailable' });
  }

  return res.json({
    encodedPolyline: result.encodedPolyline,
    distanceMeters: result.distanceMeters,
    // Kept as `duration` (seconds) — the frontend already reads this name.
    duration: result.durationSeconds,
  });
});

module.exports = router;
