// ---------------------------------------------------------------------
// Geo helpers + a browser geolocation hook.
// ---------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AIRPORTS, RIYADH_CENTER } from './constants';
import { confirmAction } from './notify';

const RIYADH_DISTRICTS = {
  malaz: { lat: 24.6872, lng: 46.7438 },
  olaya: { lat: 24.6905, lng: 46.6853 },
  sulamania: { lat: 24.6782, lng: 46.7127 },
  batha: { lat: 24.6315, lng: 46.7155 },
};

export function parseCoord(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Best-effort coords when the booking saved an address but no GPS pin. */
export function resolveCoordsFromAddress(address, lat, lng) {
  const resolvedLat = parseCoord(lat);
  const resolvedLng = parseCoord(lng);
  if (resolvedLat != null && resolvedLng != null) {
    return { lat: resolvedLat, lng: resolvedLng };
  }
  if (!address) return null;

  const lower = String(address).toLowerCase();
  for (const airport of AIRPORTS) {
    const name = airport.name.toLowerCase();
    if (lower.includes(name) || lower.includes('king khalid') || lower.includes('kkia')) {
      return { lat: airport.lat, lng: airport.lng };
    }
  }
  for (const [district, coords] of Object.entries(RIYADH_DISTRICTS)) {
    if (lower.includes(district)) return coords;
  }
  if (lower.includes('riyadh')) return RIYADH_CENTER;
  return null;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function etaMinutes(distanceKm, avgSpeedKmh = 30) {
  if (distanceKm == null) return null;
  return Math.max(1, Math.round((distanceKm / avgSpeedKmh) * 60));
}

// Compass bearing in degrees (0 = North, 90 = East) from point a to point b.
// Used to point the moving vehicle icon in its direction of travel.
export function bearingDeg(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI; // -180..180; CSS rotate handles negatives fine
}

// Speed + "is the vehicle moving?" between two points captured dtSeconds apart.
// Absurd speeds (GPS glitches or teleport test data) are ignored for the read.
export function movementFrom(prev, curr, dtSeconds, movingThresholdKmh = 3) {
  const km = haversineKm(prev, curr);
  if (km == null || !dtSeconds || dtSeconds <= 0) return { speedKmh: null, moving: false };
  const speed = (km / dtSeconds) * 3600;
  const speedKmh = speed > 400 ? null : speed;
  return { speedKmh, moving: speedKmh != null && speedKmh >= movingThresholdKmh };
}

// ---------------------------------------------------------------------
// Route-following ("snap to path").
//
// This is how Grab / Foodpanda / Uber keep the vehicle on the road. The
// naive approach — tween the marker straight from the last GPS fix to the
// next — draws a chord across whatever lies between them, so the car visibly
// cuts corners and drives through buildings. GPS fixes arrive seconds apart;
// a straight line between two of them is simply not the path the car took.
//
// The fix needs no extra API calls and no Roads API spend, because we already
// have the road geometry: the Routes API polyline the map is drawing anyway.
// So instead of interpolating in free space, we:
//   1. project the driver onto that polyline (nearest point on the route),
//   2. animate the DISTANCE ALONG the polyline between the old and new
//      projections, reading lat/lng back off the road geometry each frame,
//   3. take the heading from the polyline's tangent, so the car points the
//      way the road goes rather than at the next GPS sample.
//
// Distances use an equirectangular projection into local metres. Over the few
// km a route leg spans that is accurate to well under a metre and is far
// cheaper than haversine per segment per frame.
// ---------------------------------------------------------------------

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320;

// Precompute per-segment lengths and cumulative distance. Do this once when
// the route changes, not per animation frame.
export function pathMetrics(path) {
  if (!path || path.length < 2) return null;
  const lat0 = toRad(path[0].lat);
  const kx = Math.cos(lat0) * M_PER_DEG_LNG;
  const xy = path.map((p) => ({ x: p.lng * kx, y: p.lat * M_PER_DEG_LAT }));
  const cum = [0];
  for (let i = 1; i < xy.length; i += 1) {
    const dx = xy[i].x - xy[i - 1].x;
    const dy = xy[i].y - xy[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { path, xy, cum, total: cum[cum.length - 1], kx };
}

// Nearest point on the route to p. Returns how far along the route that is
// (metres) and how far off-route p was, so the caller can decide whether the
// driver is actually on this road at all.
export function projectOnPath(metrics, p) {
  if (!metrics || !p || p.lat == null) return null;
  const { xy, cum, kx } = metrics;
  const px = p.lng * kx;
  const py = p.lat * M_PER_DEG_LAT;
  let best = { distAlong: 0, offsetM: Infinity };
  for (let i = 1; i < xy.length; i += 1) {
    const ax = xy[i - 1].x;
    const ay = xy[i - 1].y;
    const bx = xy[i].x;
    const by = xy[i].y;
    const dx = bx - ax;
    const dy = by - ay;
    const segLen2 = dx * dx + dy * dy;
    // Degenerate segment (duplicate points appear in encoded polylines).
    const t = segLen2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segLen2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const offsetM = Math.hypot(px - cx, py - cy);
    if (offsetM < best.offsetM) {
      best = { distAlong: cum[i - 1] + Math.sqrt(segLen2) * t, offsetM };
    }
  }
  return best;
}

// Read a position (and the road's direction there) back off the route at a
// given distance along it.
export function pointAlongPath(metrics, distAlong) {
  if (!metrics) return null;
  const { path, cum, total } = metrics;
  const d = Math.max(0, Math.min(total, distAlong));
  // Binary search the segment containing d.
  let lo = 1;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const segLen = cum[i] - cum[i - 1];
  const t = segLen === 0 ? 0 : (d - cum[i - 1]) / segLen;
  const a = path[i - 1];
  const b = path[i];
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    // Tangent of the road here — this is what makes the car follow bends
    // instead of swinging toward the next GPS sample.
    heading: bearingDeg(a, b),
  };
}

// Pull the device's own heading + speed off a GeolocationCoordinates.
//
// Preferred over bearingDeg() because it comes from the chip's sensor fusion
// on the current instant, where a derived bearing needs two fixes seconds
// apart and so lags, jitters when GPS wanders at a standstill, and is simply
// unavailable on the first fix after a page load.
//
// Both are null on desktop and while stopped, hence the explicit isFinite
// guards — the browser can hand back null OR NaN here depending on engine.
// Speed arrives in m/s; the rest of the app talks km/h (see movementFrom).
export function readMotion(coords) {
  if (!coords) return { heading: null, speedKmh: null };
  const heading = Number.isFinite(coords.heading) ? coords.heading : null;
  const speed = Number.isFinite(coords.speed) ? coords.speed : null;
  return {
    // A stationary device can report heading 0 as "unknown" rather than null;
    // trusting it would snap a parked car to due north. Speed disambiguates:
    // genuinely heading due north while moving keeps its 0.
    heading: heading != null && (heading !== 0 || (speed != null && speed > 0.5)) ? heading : null,
    speedKmh: speed != null ? speed * 3.6 : null,
  };
}

// Watch (or one-shot) the device location.
//   useGeolocation({ watch: true, enabled: isOnline })
export function useGeolocation({ watch = false, enabled = true } = {}) {
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);
  const idRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const onOk = (pos) => {
      // A fresh fix clears any earlier transient error (e.g. a watch "Timeout
      // expired") so we don't keep showing a stale warning once we have a spot.
      if (!pos) return;
      setError(null);
      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        // Straight off the chip. Null is the NORMAL case, not an error:
        // desktops have no compass at all, and phones report heading as null
        // whenever the device is stationary (a parked car has no direction of
        // travel). Callers fall back to bearingDeg() between two fixes.
        ...readMotion(pos.coords),
      });
    };
    const onErr = (e) => setError(e?.message || 'Could not get your location.');
    const opts = { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 };

    // Native (Capacitor) path: the Geolocation plugin gives reliable GPS and
    // triggers the Android runtime permission prompt. watchPosition() resolves a
    // watch id asynchronously, so guard against teardown while awaiting.
    if (Capacitor.isNativePlatform()) {
      let watchId = null;
      let cancelled = false;
      (async () => {
        try {
          let perm = await Geolocation.checkPermissions();
          if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
            perm = await Geolocation.requestPermissions();
          }
          if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
            setError('Location permission denied.');
            return;
          }
          if (watch) {
            const id = await Geolocation.watchPosition(opts, (pos, err) => {
              if (err) onErr(err);
              else onOk(pos);
            });
            if (cancelled) Geolocation.clearWatch({ id });
            else watchId = id;
          } else {
            const pos = await Geolocation.getCurrentPosition(opts);
            if (!cancelled) onOk(pos);
          }
        } catch (e) {
          if (!cancelled) onErr(e);
        }
      })();
      return () => {
        cancelled = true;
        if (watchId != null) Geolocation.clearWatch({ id: watchId });
      };
    }

    // Web/browser path.
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('Geolocation is not available in this browser.');
      return undefined;
    }
    if (watch) {
      idRef.current = navigator.geolocation.watchPosition(onOk, onErr, opts);
    } else {
      navigator.geolocation.getCurrentPosition(onOk, onErr, opts);
    }
    return () => {
      if (idRef.current != null) navigator.geolocation.clearWatch(idRef.current);
    };
  }, [watch, enabled]);

  return { coords, error };
}

// One-shot high-accuracy fix, Capacitor-aware. Unlike useGeolocation (a React
// hook for continuous watching), this is a plain promise for button actions like
// the location picker's "Use current location". On native it uses the Capacitor
// plugin (Fused Location Provider + runtime permission), on web the browser API —
// so merchant/user pin-drop gets the SAME high-accuracy GPS the driver already has.
export async function getCurrentPositionOnce(opts = {}) {
  const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000, ...opts };

  if (Capacitor.isNativePlatform()) {
    let perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      perm = await Geolocation.requestPermissions();
    }
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      throw new Error('Location permission denied.');
    }
    const pos = await Geolocation.getCurrentPosition(options);
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new Error('Location is not available in this browser.');
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err?.message || 'Could not get your location.')),
      options
    );
  });
}

// Proactively ask for location permission ONCE (e.g. right after sign-in), with
// a friendly explainer before the browser's native prompt. Safe to call
// repeatedly and never throws: it no-ops if geolocation is unavailable, the
// user already decided (granted/denied), or we've asked before. This is why
// the location picker no longer fails cold the first time it needs a fix.
const GEO_PROMPT_KEY = 'sm_geo_prompted';

export async function ensureLocationPermission() {
  try {
    const native = Capacitor.isNativePlatform();
    if (!native && (typeof navigator === 'undefined' || !('geolocation' in navigator))) return;
    if (localStorage.getItem(GEO_PROMPT_KEY)) return; // asked before — don't nag

    // If the user already granted/denied, record it and skip the explainer.
    if (native) {
      try {
        const perm = await Geolocation.checkPermissions();
        // Treat "granted if either fine OR coarse is granted" — same rule as
        // useGeolocation, so the stored prompt flag matches actual behavior.
        const granted = perm.location === 'granted' || perm.coarseLocation === 'granted';
        const denied = perm.location === 'denied' && perm.coarseLocation === 'denied';
        const state = granted ? 'granted' : denied ? 'denied' : 'prompt';
        if (state === 'granted' || state === 'denied') {
          localStorage.setItem(GEO_PROMPT_KEY, state);
          return;
        }
      } catch {
        /* not decidable here — fall through and ask. */
      }
    } else if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state === 'granted' || status.state === 'denied') {
          localStorage.setItem(GEO_PROMPT_KEY, status.state);
          return;
        }
      } catch {
        /* geolocation not queryable here — fall through and ask. */
      }
    }

    // Mark asked up front so a reload mid-prompt never double-asks.
    localStorage.setItem(GEO_PROMPT_KEY, '1');
    const ok = await confirmAction({
      title: 'Share your location?',
      text: 'Alabiq uses your location to show nearby places and match you with nearby drivers.',
      confirmText: 'Allow location',
      cancelText: 'Not now',
      icon: 'info',
    });
    if (!ok) return;

    if (native) {
      // Native: this is what actually surfaces the Android runtime prompt.
      try { await Geolocation.requestPermissions(); } catch { /* ignore */ }
    } else {
      // Fire the browser's native prompt (result handled elsewhere when needed).
      navigator.geolocation.getCurrentPosition(
        () => {},
        () => {},
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
      );
    }
  } catch {
    /* never let the permission prompt break sign-in */
  }
}
