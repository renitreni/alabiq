// ---------------------------------------------------------------------
// Geo helpers (pure). Used to sort the "nearest available" ride feed and
// to estimate a rough ETA from the driver to the pickup point.
// ---------------------------------------------------------------------
const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle distance in km.
function haversineKm(a, b) {
  if (a == null || b == null) return null;
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function etaMinutes(distanceKm, avgSpeedKmh = 30) {
  if (distanceKm == null) return null;
  const speed = avgSpeedKmh > 0 ? avgSpeedKmh : 30;
  return Math.max(1, Math.round((distanceKm / speed) * 60));
}

// Great-circle distance in metres — same math as haversineKm, just the unit
// a geofence check actually wants to compare against a radius in meters.
function distanceMeters(a, b) {
  const km = haversineKm(a, b);
  return km == null ? null : km * 1000;
}

// A Mapbox reverse geocode (Geocoding v5) returns several candidates for one
// point. Prefer a real street address (place_type "address"), else the first
// feature. On an address feature, `text` is the street name and `address` the
// house number — when either is missing the customer fills it in, which is
// common in KSA.
function placeFromMapboxReverse(features, lat, lng) {
  const list = Array.isArray(features) ? features : [];
  const is = (f, type) => (f.place_type || []).includes(type);
  const top = list.find((f) => is(f, 'address')) || list[0];
  if (!top) return null;

  const ctx = Array.isArray(top.context) ? top.context : [];
  const ctxText = (prefix) =>
    (ctx.find((c) => String((c && c.id) || '').startsWith(prefix)) || {}).text || '';
  const c = top.center || (top.geometry && top.geometry.coordinates) || [];
  return {
    id: String((top.properties && top.properties.mapbox_id) || `${lat},${lng}`),
    name: (top.place_name || top.text || '').split(',')[0] || 'Selected location',
    address: top.place_name || '',
    lat: Number.isFinite(Number(c[1])) ? Number(c[1]) : lat,
    lng: Number.isFinite(Number(c[0])) ? Number(c[0]) : lng,
    type: (top.place_type && top.place_type[0]) || 'place',
    street: top.text && is(top, 'address') ? top.text : ctxText('street'),
    buildingNumber: top.address || '',
  };
}

module.exports = { haversineKm, etaMinutes, distanceMeters, placeFromMapboxReverse };
