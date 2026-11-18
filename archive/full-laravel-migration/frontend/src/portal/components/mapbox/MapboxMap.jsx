// Mapbox GL renderer behind RideMap. Keep this component's public props in
// lockstep with GoogleMap so the rest of the application stays provider-blind.
import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { RIYADH_CENTER } from '../../lib/constants';
import { haversineKm, pathMetrics, pointAlongPath, projectOnPath } from '../../lib/geo';
import { buildPinEl, pinSignature, refreshPinEl, updateDriverHeading } from '../map/pinHtml';

const ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const STYLE_URL = import.meta.env.VITE_MAPBOX_STYLE || 'mapbox://styles/mapbox/streets-v12';
const RTL_PLUGIN_URL =
  'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.4.0/mapbox-gl-rtl-text.js';
const EMPTY_FC = { type: 'FeatureCollection', features: [] };
const DEFAULT_TWEEN_MS = 4000;
const SNAP_TOLERANCE_M = 70;

try {
  if (mapboxgl.getRTLTextPluginStatus?.() === 'unavailable') {
    mapboxgl.setRTLTextPlugin(RTL_PLUGIN_URL, null, true);
  }
} catch {
  // HMR can evaluate this module again after the singleton plugin is loaded.
}

function firstSymbolLayerId(map) {
  try {
    return (map.getStyle()?.layers || []).find((layer) => layer.type === 'symbol')?.id;
  } catch {
    return undefined;
  }
}

function addRouteLayers(map) {
  if (map.getSource('sm-route')) return;
  map.addSource('sm-route', { type: 'geojson', data: EMPTY_FC });
  const before = firstSymbolLayerId(map);
  map.addLayer(
    {
      id: 'sm-route-casing',
      type: 'line',
      source: 'sm-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.85 },
    },
    before
  );
  map.addLayer(
    {
      id: 'sm-route-line',
      type: 'line',
      source: 'sm-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#FF7E21',
        'line-width': 4,
        'line-opacity': 0.95,
        'line-dasharray': [2.5, 2],
      },
    },
    before
  );
}

export default function MapboxMap({
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
  const markerStoreRef = useRef(new Map());
  const driverPosRef = useRef(null);
  const lastFixAtRef = useRef(null);
  const rafRef = useRef(null);
  const didFollowFitRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const valid = markers.filter((marker) => marker && marker.lat != null && marker.lng != null);
  const driver = valid.find((marker) => marker.type === 'driver') || null;
  const lineSig =
    line && line.length >= 2 ? JSON.stringify(line.map((point) => [point.lat, point.lng])) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metrics = useMemo(() => (line && line.length >= 2 ? pathMetrics(line) : null), [lineSig]);

  // Create the map once. LocationPicker remounts this renderer when a new
  // adjustment session starts, so initialCenter is intentionally initial-only.
  useEffect(() => {
    let cancelled = false;
    let loadTimer = null;
    const store = markerStoreRef.current;

    try {
      mapboxgl.accessToken = ACCESS_TOKEN;
      const first = initialCenter || valid[0] || RIYADH_CENTER;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [first.lng, first.lat],
        zoom: initialCenter ? 16 : 12,
        maxPitch: 60,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }));
      map.addControl(
        new mapboxgl.NavigationControl({ showZoom: true, showCompass: true, visualizePitch: true }),
        'top-right'
      );

      mapRef.current = map;
      map.on('load', () => {
        if (cancelled) return;
        if (loadTimer) clearTimeout(loadTimer);
        addRouteLayers(map);
        setFailed(false);
        setReady(true);
      });
      map.on('error', (event) => {
        console.error('Mapbox map error:', event?.error?.message || event?.error || event);
      });

      // Authentication and style failures do not always reject construction;
      // avoid leaving users on an endless loading surface when load never fires.
      loadTimer = setTimeout(() => {
        if (!cancelled && !map.loaded()) setFailed(true);
      }, 20000);
    } catch (error) {
      console.error('Mapbox failed to initialize:', error?.message || error);
      loadTimer = setTimeout(() => {
        if (!cancelled) setFailed(true);
      }, 0);
    }

    return () => {
      cancelled = true;
      if (loadTimer) clearTimeout(loadTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      store.clear();
      driverPosRef.current = null;
      lastFixAtRef.current = null;
      const map = mapRef.current;
      mapRef.current = null;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile DOM markers without recreating unchanged pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const store = markerStoreRef.current;
    const seen = new Set();

    valid.forEach((markerData, index) => {
      const id = String(markerData.key ?? `${markerData.type || 'pin'}:${index}`);
      seen.add(id);
      const sig = pinSignature(markerData);
      let entry = store.get(id);

      if (!entry) {
        const { el, size, isDriver } = buildPinEl(markerData);
        if (isDriver) el.style.zIndex = '1000';
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom', offset: [0, 2] })
          .setLngLat([markerData.lng, markerData.lat])
          .addTo(map);
        entry = { marker, el, sig, isDriver, label: null };
        if (!isDriver && markerData.label) {
          const span = document.createElement('span');
          span.className = 'sm-map-popup-label';
          span.textContent = markerData.label;
          marker.setPopup(
            new mapboxgl.Popup({ offset: size + 4, closeButton: false }).setDOMContent(span)
          );
          entry.label = markerData.label;
        }
        store.set(id, entry);
        if (isDriver) driverPosRef.current = { lat: markerData.lat, lng: markerData.lng };
        return;
      }

      if (entry.sig !== sig) {
        refreshPinEl(entry.el, markerData);
        entry.sig = sig;
      }
      if (entry.isDriver) {
        updateDriverHeading(entry.el, markerData.heading);
      } else {
        entry.marker.setLngLat([markerData.lng, markerData.lat]);
        if (markerData.label && markerData.label !== entry.label) {
          const span = document.createElement('span');
          span.className = 'sm-map-popup-label';
          span.textContent = markerData.label;
          const popup = entry.marker.getPopup();
          if (popup) popup.setDOMContent(span);
          else entry.marker.setPopup(new mapboxgl.Popup({ closeButton: false }).setDOMContent(span));
          entry.label = markerData.label;
        }
      }
    });

    for (const [id, entry] of store) {
      if (!seen.has(id)) {
        entry.marker.remove();
        store.delete(id);
      }
    }
  }, [markers, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Glide the driver for the full measured GPS interval and, when possible,
  // follow the route geometry instead of cutting across road bends.
  useEffect(() => {
    if (!ready || !driver) return undefined;
    let entry = null;
    for (const candidate of markerStoreRef.current.values()) {
      if (candidate.isDriver) {
        entry = candidate;
        break;
      }
    }
    if (!entry) return undefined;

    const from = driverPosRef.current || { lat: driver.lat, lng: driver.lng };
    const to = { lat: driver.lat, lng: driver.lng };
    const jump = Math.abs(to.lat - from.lat) + Math.abs(to.lng - from.lng);
    if (jump === 0 || jump > 0.5) {
      entry.marker.setLngLat([to.lng, to.lat]);
      driverPosRef.current = to;
      lastFixAtRef.current = performance.now();
      return undefined;
    }

    const start = performance.now();
    const gap = lastFixAtRef.current ? start - lastFixAtRef.current : DEFAULT_TWEEN_MS;
    const duration = Math.min(9000, Math.max(1000, gap));
    lastFixAtRef.current = start;
    let snap = null;
    if (metrics) {
      const fromProjection = projectOnPath(metrics, from);
      const toProjection = projectOnPath(metrics, to);
      if (
        fromProjection &&
        toProjection &&
        fromProjection.offsetM <= SNAP_TOLERANCE_M &&
        toProjection.offsetM <= SNAP_TOLERANCE_M
      ) {
        snap = { fromD: fromProjection.distAlong, toD: toProjection.distAlong };
      }
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      let position;
      if (snap) {
        const distance = snap.fromD + (snap.toD - snap.fromD) * eased;
        position = pointAlongPath(metrics, distance);
        if (position.heading != null && Math.abs(snap.toD - snap.fromD) > 3) {
          updateDriverHeading(entry.el, position.heading);
        }
      } else {
        position = {
          lat: from.lat + (to.lat - from.lat) * eased,
          lng: from.lng + (to.lng - from.lng) * eased,
        };
      }
      entry.marker.setLngLat([position.lng, position.lat]);
      driverPosRef.current = { lat: position.lat, lng: position.lng };
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return undefined;
  }, [driver?.lat, driver?.lng, ready, lineSig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource('sm-route');
    if (!source) return;
    source.setData(
      line && line.length >= 2
        ? {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: line.map((point) => [point.lng, point.lat]),
            },
          }
        : EMPTY_FC
    );
  }, [lineSig, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // In picker mode, camera automation is disabled and the settled center is
  // reported once per completed pan/zoom gesture.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !interactive) return undefined;
    const handleMoveEnd = () => {
      const center = map.getCenter();
      onIdleRef.current?.({ lat: center.lat, lng: center.lng });
    };
    map.on('moveend', handleMoveEnd);
    return () => map.off('moveend', handleMoveEnd);
  }, [ready, interactive]);

  const pointsSig = JSON.stringify(valid.map((point) => [point.lat, point.lng]));
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || interactive || (follow && driver) || valid.length === 0) return;
    const bearing = map.getBearing();
    if (valid.length === 1) {
      map.easeTo({ center: [valid[0].lng, valid[0].lat], zoom: 14, bearing });
      return;
    }

    let maxSpread = 0;
    for (let i = 0; i < valid.length; i += 1) {
      for (let j = i + 1; j < valid.length; j += 1) {
        const distance = haversineKm(valid[i], valid[j]);
        if (distance != null && distance > maxSpread) maxSpread = distance;
      }
    }
    if (maxSpread > 80) {
      const local = valid.find((point) => point.type === 'driver') || valid[0];
      map.easeTo({ center: [local.lng, local.lat], zoom: 14, bearing });
      return;
    }

    const bounds = valid.reduce(
      (result, point) => result.extend([point.lng, point.lat]),
      new mapboxgl.LngLatBounds(
        [valid[0].lng, valid[0].lat],
        [valid[0].lng, valid[0].lat]
      )
    );
    map.fitBounds(bounds, { padding: 48, maxZoom: 15, bearing });
  }, [pointsSig, follow, !!driver, ready, interactive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!follow) didFollowFitRef.current = false;
  }, [follow]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !follow || !driver || interactive) return;
    const bearing = map.getBearing();
    const hasTarget = followTarget && followTarget.lat != null && followTarget.lng != null;

    if (hasTarget) {
      const distance = haversineKm(driver, followTarget);
      if (distance != null && distance > 80) {
        map.easeTo({ center: [driver.lng, driver.lat], zoom: 14, bearing, duration: 1200 });
        return;
      }
    }

    if (!didFollowFitRef.current) {
      didFollowFitRef.current = true;
      if (hasTarget) {
        const bounds = new mapboxgl.LngLatBounds(
          [driver.lng, driver.lat],
          [driver.lng, driver.lat]
        ).extend([followTarget.lng, followTarget.lat]);
        map.fitBounds(bounds, { padding: 72, maxZoom: 15, bearing });
      } else {
        map.easeTo({
          center: [driver.lng, driver.lat],
          zoom: Math.max(map.getZoom(), 14),
          bearing,
        });
      }
      return;
    }

    map.easeTo({
      center: [driver.lng, driver.lat],
      zoom: map.getZoom(),
      bearing,
      duration: 1200,
    });
  // The coordinate primitives are the intentional dependencies; depending on
  // the derived marker objects would re-run the camera effect every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    follow,
    driver?.lat,
    driver?.lng,
    followTarget?.lat,
    followTarget?.lng,
    ready,
    interactive,
  ]);

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
