// =====================================================================
// DEMO/TEST-ONLY — drive a virtual driver along a real road route.
//
// Exists so "is the map actually moving?" can be answered at a desk instead
// of by paying someone to drive around Riyadh with two phones. It posts to
// the SAME endpoint the driver app posts to (POST /api/driver/location), as
// a real signed-in approved driver, so every layer under test is the real
// one: rate limiter, auth, the write/broadcast throttles, realtime fan-out,
// and the customer page's marker tween.
//
//   npm run sim:driver -- --code SM-ABC123
//   npm run sim:driver -- --code SM-ABC123 --speed 60 --ping 4000
//   npm run sim:driver -- --from 24.72,46.69 --to 24.6913,46.6852
//
// Options
//   --code   <bookingCode>  Drive that booking's route: driver -> pickup ->
//                           dropoff. Reads the real row, so the customer's
//                           /track/<code> page follows this simulated car.
//   --from   lat,lng        Explicit start (default: DRIVER_AT in _demo-lib)
//   --to     lat,lng        Explicit end
//   --speed  <km/h>         Travel speed (default 40)
//   --ping   <ms>           Post interval (default 4000, matching the app)
//   --email / --password    Driver account (default: the demo driver)
//   --loop                  Restart from the beginning on arrival
//
// The route comes from the same /api/route proxy the app uses, so the car
// follows actual roads. If that is unavailable it falls back to a straight
// line and says so — still enough to prove the marker animates.
// =====================================================================
require('dotenv').config();
const { database, DEMO_DRIVER, DRIVER_AT, PICKUP } = require('./_demo-lib');

const API_BASE = process.env.SIM_API_BASE || `http://localhost:${process.env.PORT || 4000}`;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

function parsePoint(s) {
  if (!s || s === true) return null;
  const [lat, lng] = String(s).split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;

function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Compass bearing a -> b, normalised to 0..360 to match what a device reports.
function bearingDeg(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// Decode a precision-5 encoded polyline (same format lib/osrm.js decodes).
function decodePolyline(str) {
  const pts = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    let shift = 0;
    let result = 0;
    let b;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

// Ask the backend's own Routes proxy for a road path between two points.
async function roadPath(from, to) {
  try {
    const url =
      `${API_BASE}/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json();
    if (!body.encodedPolyline) return null;
    const pts = decodePolyline(body.encodedPolyline);
    return pts.length >= 2 ? pts : null;
  } catch {
    return null;
  }
}

// Walk a list of waypoints at a fixed speed, emitting a position every step.
// Interpolates WITHIN each leg so the ping rate, not the polyline density,
// decides how smooth the motion is.
function* walk(path, stepKm) {
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const legKm = haversineKm(a, b);
    if (legKm === 0) continue;
    const steps = Math.max(1, Math.ceil(legKm / stepKm));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      yield {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        heading: bearingDeg(a, b),
      };
    }
  }
  const last = path[path.length - 1];
  yield { ...last, heading: bearingDeg(path[path.length - 2] || last, last) };
}

// Sign in through the app's own login endpoint — same path the driver app
// uses — and hand the session token to the location pings.
async function signIn(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) {
    throw new Error(`Could not sign in as ${email}: ${body.error || `HTTP ${res.status}`}`);
  }
  return body.token;
}

async function run() {
  const email = String(arg('email', DEMO_DRIVER.email));
  const password = String(arg('password', DEMO_DRIVER.password));
  const speedKmh = Number(arg('speed', 40));
  const pingMs = Number(arg('ping', 4000));
  const loop = !!arg('loop', false);
  const code = arg('code');

  let waypoints = [];
  if (code && code !== true) {
    const { rows } = await database.query(
      `SELECT booking_code, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, driver_ride_status
         FROM public.bookings WHERE booking_code=$1`, [String(code)],
    );
    const booking = rows[0];
    if (!booking) throw new Error(`Booking ${code} not found`);
    // Before the trip starts the driver is heading to pickup; after, to the
    // drop-off. Mirrors the leg the tracking page actually draws.
    const started = booking.driver_ride_status === 'started';
    waypoints = started
      ? [{ lat: booking.pickup_lat, lng: booking.pickup_lng }, { lat: booking.dropoff_lat, lng: booking.dropoff_lng }]
      : [DRIVER_AT, { lat: booking.pickup_lat, lng: booking.pickup_lng }];
    console.log(`Driving booking ${booking.booking_code} (${started ? 'pickup -> dropoff' : 'driver -> pickup'})`);
  } else {
    const from = parsePoint(arg('from')) || DRIVER_AT;
    const to = parsePoint(arg('to')) || PICKUP;
    waypoints = [from, to];
  }

  const road = await roadPath(waypoints[0], waypoints[waypoints.length - 1]);
  const path = road || waypoints;
  if (!road) {
    console.warn(
      'Routes API unavailable — falling back to a straight line. The marker still ' +
        'animates; it just will not follow roads. (Check MAPBOX_ACCESS_TOKEN.)'
    );
  }

  const token = await signIn(email, password);
  const stepKm = (speedKmh / 3600) * (pingMs / 1000);
  const totalKm = path.reduce((sum, p, i) => (i ? sum + haversineKm(path[i - 1], p) : 0), 0);

  console.log(
    `Route: ${path.length} points, ${totalKm.toFixed(2)} km. ` +
      `Speed ${speedKmh} km/h, ping ${pingMs}ms -> ~${Math.round((totalKm / speedKmh) * 60)} min of driving.`
  );
  console.log(`Posting to ${API_BASE}/api/driver/location as ${email}. Ctrl+C to stop.\n`);

  let sent = 0;
  do {
    for (const point of walk(path, stepKm)) {
      const body = {
        lat: Number(point.lat.toFixed(6)),
        lng: Number(point.lng.toFixed(6)),
        accuracy: 8,
        heading: Number(point.heading.toFixed(1)),
        speed_kmh: speedKmh,
      };
      const res = await fetch(`${API_BASE}/api/driver/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      sent += 1;
      if (!res.ok) {
        const text = await res.text();
        console.error(`  ping ${sent} failed: ${res.status} ${text}`);
        // 401/403 will never recover on its own — stop rather than spam.
        if (res.status === 401 || res.status === 403) return;
      } else {
        process.stdout.write(
          `\r  ping ${sent}  ${body.lat.toFixed(5)},${body.lng.toFixed(5)}  hdg ${body.heading}°   `
        );
      }
      await new Promise((r) => setTimeout(r, pingMs));
    }
    console.log('\nArrived.');
  } while (loop);
}

run().catch((e) => {
  console.error('\nsimulate-driver failed:', e.message || e);
  process.exit(1);
});
