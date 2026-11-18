// ---------------------------------------------------------------------
// Road-route helper backed by the backend Google Routes proxy (/api/route).
//
// fetchRoute(from, to) returns the real driving route geometry + a
// route-based distance/ETA. It is best-effort: on any failure (network,
// timeout, no route) it resolves to `null` so callers fall back to a straight
// line + their existing crow-flies ETA. No external dependency — uses the
// browser `fetch` and decodes Google's encoded polyline inline.
//
// (Filename kept as osrm.js to avoid churn; the routing provider is now Google.)
// ---------------------------------------------------------------------

import { resolveApiBase } from './apiConfig';

const API_BASE = resolveApiBase();
const ROUTE_URL = `${API_BASE}/api/route`;

function valid(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

// Decode a Google/OSRM-style encoded polyline (precision 5) to {lat,lng}[].
// Standard algorithm — no dependency needed.
function decodePolyline(str) {
  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = str.length;
  while (index < len) {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coords;
}

/**
 * @param {{lat:number,lng:number}} from
 * @param {{lat:number,lng:number}} to
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{coords:{lat:number,lng:number}[], distanceKm:number, durationMin:number}|null>}
 */
export async function fetchRoute(from, to, opts = {}) {
  if (!valid(from) || !valid(to)) return null;

  const timeoutMs = opts.timeoutMs ?? 6000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${ROUTE_URL}?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.encodedPolyline) return null;

    const coords = decodePolyline(data.encodedPolyline).filter(
      (c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)
    );
    if (coords.length < 2) return null;

    return {
      coords,
      distanceKm: data.distanceMeters != null ? data.distanceMeters / 1000 : null,
      durationMin: data.duration != null ? Math.max(1, Math.round(data.duration / 60)) : null,
    };
  } catch {
    // Aborted / network / parse error -> let the caller fall back.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
