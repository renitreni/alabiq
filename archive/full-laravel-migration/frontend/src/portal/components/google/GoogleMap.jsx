// ---------------------------------------------------------------------
// The Google Maps renderer behind RideMap (replaces the MapLibre engine).
// Same prop subset RideMap forwards: markers, line, follow, followTarget,
// interactive, onIdle.
// This is the LAZY CHUNK: the Google Maps JS API is loaded here (via a small
// self-contained script loader) so only map screens pull it in. One SDK serves
// both the website and the Capacitor APK webview — no native Google Maps SDK.
//
// The brand pins (teardrops, rotating driver car) are reused unchanged from the
// shared pinHtml.js — they are plain DOM elements, which Google's
// AdvancedMarkerElement takes directly as marker content.
// ---------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import { RIYADH_CENTER } from '../../lib/constants';
import { haversineKm, pathMetrics, projectOnPath, pointAlongPath } from '../../lib/geo';
import { buildPinEl, refreshPinEl, updateDriverHeading, pinSignature } from '../map/pinHtml';

const BROWSER_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID;

// How long to glide for before we have two fixes to measure a real gap from
// (i.e. the second fix of a session). Roughly the driver app's ping interval.
const DEFAULT_TWEEN_MS = 4000;

// How far off the drawn route a driver may be and still be considered "on"
// it. Beyond this we stop snapping and tween in a straight line, because the
// driver genuinely is not on the road we are drawing — they have diverged,
// taken a turn the route did not anticipate, or the route is stale. Snapping
// a truly off-route car onto the polyline would teleport it sideways, which
// is a worse lie than a short straight segment.
//
// 70m covers normal GPS error (a phone in a city reports 5-30m, worse beside
// tall buildings) plus dual-carriageway width, without swallowing a car that
// is actually on a parallel street.
const SNAP_TOLERANCE_M = 70;

// Load the Google Maps JS API once per session and resolve to the google.maps
// namespace. Uses the modern async bootstrap + importLibrary so we stay off the
// legacy synchronous loader warning. Safe to call concurrently (singleton).
let mapsPromise = null;
function loadGoogleMaps() {
  if (mapsPromise) return mapsPromise;
  // Base script already present: still await the libraries (they may not be
  // imported yet) before resolving, so g.Map / g.marker are guaranteed.
  if (typeof window !== 'undefined' && window.google?.maps?.importLibrary) {
    mapsPromise = Promise.all([
      window.google.maps.importLibrary('maps'),
      window.google.maps.importLibrary('marker'),
    ]).then(() => window.google.maps);
    return mapsPromise;
  }
  mapsPromise = new Promise((resolve, reject) => {
    if (!BROWSER_KEY) {
      reject(new Error('VITE_GOOGLE_MAPS_BROWSER_KEY is not set'));
      return;
    }
    const cbName = '__smGoogleMapsInit';
    window[cbName] = async () => {
      try {
        await window.google.maps.importLibrary('maps'); // Map, Polyline, LatLngBounds, InfoWindow
        await window.google.maps.importLibrary('marker'); // AdvancedMarkerElement
        resolve(window.google.maps);
      } catch (e) {
        reject(e);
      }
    };
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      v: 'weekly',
      loading: 'async',
      callback: cbName,
    });
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load the Google Maps script'));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export default function GoogleMap({
  markers = [],
  line = null,
  follow = false,
  followTarget = null,
  interactive = false,
  onIdle = null,
  initialCenter = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const gRef = useRef(null); // google.maps namespace
  const markerStoreRef = useRef(new Map()); // id -> { marker, el, sig, isDriver, label }
  const routeRef = useRef(null); // { casing, main }
  const infoRef = useRef(null); // shared InfoWindow for pin labels
  const driverPosRef = useRef(null); // live (tweened) driver position
  const lastFixAtRef = useRef(null); // when the previous fix landed, to size the tween
  const rafRef = useRef(null);
  const didFollowFitRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const valid = markers.filter((m) => m && m.lat != null && m.lng != null);
  const driver = valid.find((m) => m.type === 'driver') || null;

  // Route geometry, precomputed for snapping. Declared here (above the tween
  // effect that reads it) because the segment lengths only change when the
  // route itself does — recomputing them per animation frame would be waste.
  const lineSig =
    line && line.length >= 2 ? JSON.stringify(line.map((p) => [p.lat, p.lng])) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metrics = useMemo(() => (line && line.length >= 2 ? pathMetrics(line) : null), [lineSig]);

  // Cap the zoom after a fitBounds (Google has no maxZoom arg) so a close pair
  // of points doesn't slam to street level.
  function capZoomOnce(map, g, maxZoom = 15) {
    g.event.addListenerOnce(map, 'idle', () => {
      if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
    });
  }

  // --- 1. Create the map once ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const store = markerStoreRef.current; // captured for the cleanup closure
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        gRef.current = g;
        // initialCenter matters most in interactive mode: there are no markers
        // to derive a camera from and the fit-all effect is suppressed, so
        // without it the map would open over RIYADH_CENTER regardless of where
        // the caller's pin actually is.
        const first = initialCenter || valid[0] || RIYADH_CENTER;
        const map = new g.Map(containerRef.current, {
          center: { lat: first.lat, lng: first.lng },
          zoom: initialCenter ? 16 : 12,
          mapId: MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        });
        mapRef.current = map;
        // Route as two lines: white casing under the orange route.
        routeRef.current = {
          casing: new g.Polyline({ map, path: [], strokeColor: '#FFFFFF', strokeOpacity: 0.85, strokeWeight: 8, zIndex: 1 }),
          main: new g.Polyline({ map, path: [], strokeColor: '#FF7E21', strokeOpacity: 0.95, strokeWeight: 4, zIndex: 2 }),
        };
        infoRef.current = new g.InfoWindow();
        setReady(true);
      })
      .catch((err) => {
        console.error('Google Maps failed to load:', err?.message || err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const entry of store.values()) entry.marker.map = null;
      store.clear();
      if (routeRef.current) {
        routeRef.current.casing.setMap(null);
        routeRef.current.main.setMap(null);
        routeRef.current = null;
      }
      if (infoRef.current) {
        infoRef.current.close();
        infoRef.current = null;
      }
      driverPosRef.current = null;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 2. Marker reconciler (create / update / remove, no leaks) -------------
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!ready || !map || !g) return;
    const { AdvancedMarkerElement } = g.marker;
    const store = markerStoreRef.current;
    const seen = new Set();

    valid.forEach((m, i) => {
      const id = String(m.key ?? `${m.type || 'pin'}:${i}`);
      seen.add(id);
      const sig = pinSignature(m);
      let entry = store.get(id);

      if (!entry) {
        const { el, isDriver } = buildPinEl(m);
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: m.lat, lng: m.lng },
          content: el,
          zIndex: isDriver ? 1000 : undefined,
        });
        entry = { marker, el, sig, isDriver, label: null };
        if (!isDriver && m.label) {
          el.style.cursor = 'pointer';
          entry.label = m.label;
          el.addEventListener('click', () => {
            const info = infoRef.current;
            if (!info) return;
            const span = document.createElement('span');
            span.className = 'sm-map-popup-label';
            span.textContent = entry.label || '';
            info.setContent(span);
            info.open({ map, anchor: marker });
          });
        }
        store.set(id, entry);
        if (isDriver) driverPosRef.current = { lat: m.lat, lng: m.lng };
        return;
      }

      if (entry.sig !== sig) {
        refreshPinEl(entry.el, m);
        entry.sig = sig;
      }
      if (entry.isDriver) {
        // Position handled by the tween effect; heading rotates in place.
        updateDriverHeading(entry.el, m.heading);
      } else {
        entry.marker.position = { lat: m.lat, lng: m.lng };
        if (m.label) entry.label = m.label;
      }
    });

    for (const [id, entry] of store) {
      if (!seen.has(id)) {
        // eslint-disable-next-line react-hooks/immutability
        entry.marker.map = null; // detach the Google marker (imperative interop)
        store.delete(id);
      }
    }
  }, [markers, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- 3. Driver tween: glide between GPS fixes ------------------------------
  // The duration is measured, not fixed. A hard-coded 1200ms was the reason
  // the car looked frozen: fixes arrive every several seconds, so the marker
  // finished its glide almost immediately and then sat still until the next
  // one. Spending the whole gap in motion is what reads as "live".
  useEffect(() => {
    if (!ready || !driver) return undefined;
    let entry = null;
    for (const e of markerStoreRef.current.values()) {
      if (e.isDriver) { entry = e; break; }
    }
    if (!entry) return undefined;

    const from = driverPosRef.current || { lat: driver.lat, lng: driver.lng };
    const to = { lat: driver.lat, lng: driver.lng };
    const jump = Math.abs(to.lat - from.lat) + Math.abs(to.lng - from.lng);
    // Snap instantly on the first fix or an implausible jump (test/teleport data).
    if (jump === 0 || jump > 0.5) {
      entry.marker.position = to;
      driverPosRef.current = to;
      lastFixAtRef.current = performance.now();
      return undefined;
    }

    const start = performance.now();
    // Assume the next fix lands after the same gap as the last one. Clamped:
    // the floor keeps a burst of fixes from looking jittery, and the ceiling
    // stops one long GPS gap (tunnel, backgrounded app) from committing the
    // car to a minute-long crawl it can never catch up from.
    const gap = lastFixAtRef.current ? start - lastFixAtRef.current : DEFAULT_TWEEN_MS;
    const duration = Math.min(9000, Math.max(1000, gap));
    lastFixAtRef.current = start;

    // --- Follow the ROAD, not the chord between two GPS fixes ---
    // Both ends are projected onto the drawn route; if both sit on it we
    // animate the distance ALONG the route and read lat/lng back off the road
    // geometry each frame. That is what stops the car cutting corners and
    // driving through buildings between fixes. Falls back to a straight tween
    // whenever there is no route, or the driver is genuinely off it.
    let snap = null;
    if (metrics) {
      const a = projectOnPath(metrics, from);
      const b = projectOnPath(metrics, to);
      if (a && b && a.offsetM <= SNAP_TOLERANCE_M && b.offsetM <= SNAP_TOLERANCE_M) {
        snap = { fromD: a.distAlong, toD: b.distAlong };
      }
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease out slightly: real vehicles decelerate into a stop, and a purely
      // linear tween that ends dead-still every cycle looks mechanical.
      const e = 1 - (1 - t) * (1 - t);
      let pos;
      if (snap) {
        const d = snap.fromD + (snap.toD - snap.fromD) * e;
        const onRoad = pointAlongPath(metrics, d);
        pos = { lat: onRoad.lat, lng: onRoad.lng };
        // Point the car along the road it is on. Only while genuinely moving:
        // at a standstill the tangent of a near-zero step is noise, and the
        // device's own heading (already applied by the reconciler) is better.
        if (onRoad.heading != null && Math.abs(snap.toD - snap.fromD) > 3) {
          updateDriverHeading(entry.el, onRoad.heading);
        }
      } else {
        pos = {
          lat: from.lat + (to.lat - from.lat) * e,
          lng: from.lng + (to.lng - from.lng) * e,
        };
      }
      entry.marker.position = pos;
      driverPosRef.current = pos;
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.lat, driver?.lng, ready, lineSig]);

  // --- 4. Route line data ----------------------------------------------------
  // lineSig is computed at the top of the component — the tween effect above
  // needs it too, for the route-snapping metrics.
  useEffect(() => {
    if (!ready || !routeRef.current) return;
    const path = line && line.length >= 2 ? line.map((p) => ({ lat: p.lat, lng: p.lng })) : [];
    routeRef.current.casing.setPath(path);
    routeRef.current.main.setPath(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineSig, ready]);

  // --- 5. Interactive mode: report the center once panning/zooming settles ---
  // Used by LocationPicker's "adjust pin on map" flow — a fixed pin sits at
  // screen-center (drawn by the caller, not a marker here) and the user pans
  // the map underneath it. `idle` (not `center_changed`) fires once per
  // gesture, after the map stops moving, so this can't spam reverse-geocode
  // on every intermediate frame of a drag.
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!ready || !map || !g || !interactive) return undefined;
    const listener = g.event.addListener(map, 'idle', () => {
      const center = map.getCenter();
      if (center) onIdleRef.current?.({ lat: center.lat(), lng: center.lng() });
    });
    return () => listener.remove();
  }, [ready, interactive]);

  // --- 6. Camera: fit-all (default) ------------------------------------------
  // Skipped in interactive mode: fitBounds would fight the user's own panning.
  const pointsSig = JSON.stringify(valid.map((p) => [p.lat, p.lng]));
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!ready || !map || !g || interactive || (follow && driver) || valid.length === 0) return;
    if (valid.length === 1) {
      map.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
      map.setZoom(14);
      return;
    }
    let maxSpread = 0;
    for (let i = 0; i < valid.length; i += 1) {
      for (let j = i + 1; j < valid.length; j += 1) {
        const d = haversineKm(valid[i], valid[j]);
        if (d != null && d > maxSpread) maxSpread = d;
      }
    }
    // Points on different continents (e.g. test GPS) — stay local, not world zoom.
    if (maxSpread > 80) {
      const d = valid.find((p) => p.type === 'driver') || valid[0];
      map.setCenter({ lat: d.lat, lng: d.lng });
      map.setZoom(14);
      return;
    }
    const bounds = new g.LatLngBounds();
    valid.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 48);
    capZoomOnce(map, g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsSig, follow, !!driver, ready, interactive]);

  // --- 7. Camera: follow the driver + leg target -----------------------------
  useEffect(() => {
    if (!follow) didFollowFitRef.current = false;
  }, [follow]);

  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!ready || !map || !g || !follow || !driver || interactive) return;
    const hasTarget = followTarget && followTarget.lat != null && followTarget.lng != null;

    // Test/teleport data on far-apart points: stay local, don't world-zoom.
    if (hasTarget) {
      const dist = haversineKm(driver, followTarget);
      if (dist != null && dist > 80) {
        map.setCenter({ lat: driver.lat, lng: driver.lng });
        map.setZoom(14);
        return;
      }
    }

    // First frame after follow engages: fit driver (+ target) once.
    if (!didFollowFitRef.current) {
      didFollowFitRef.current = true;
      if (hasTarget) {
        const bounds = new g.LatLngBounds();
        bounds.extend({ lat: driver.lat, lng: driver.lng });
        bounds.extend({ lat: followTarget.lat, lng: followTarget.lng });
        map.fitBounds(bounds, 72);
        capZoomOnce(map, g);
      } else {
        map.setCenter({ lat: driver.lat, lng: driver.lng });
        map.setZoom(Math.max(map.getZoom() || 0, 14));
      }
      return;
    }

    // Subsequent pings: gentle pan to the driver, keeping the current zoom.
    map.panTo({ lat: driver.lat, lng: driver.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, driver?.lat, driver?.lng, followTarget?.lat, followTarget?.lng, ready, interactive]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: '#F3F4F6' }}>
        <p className="text-sm font-bold text-brand-grey px-6 text-center">
          The live map could not be loaded. Please check your connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="sm-ride-map"
      style={{ height: '100%', width: '100%', background: '#F3F4F6' }}
    />
  );
}
