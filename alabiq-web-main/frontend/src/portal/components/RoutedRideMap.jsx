// ---------------------------------------------------------------------
// RideMap that draws the REAL road route between `from` and `to` (via the
// backend Google Routes proxy), falling back to `fallbackLine` (a straight
// [a,b] guide) when routing is unavailable. It keeps the route fetch OUT of the
// big page components — every other prop passes straight through to RideMap.
//
// The route only refetches when an endpoint moves ~100m (rounded signature),
// so a driver/rider GPS ping every 8-12s does NOT hammer the /api/route proxy.
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import RideMap from './RideMap';
import { fetchRoute } from '../lib/osrm';

const r3 = (x) => (x == null ? '' : Math.round(x * 1000) / 1000);
const valid = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export default function RoutedRideMap({ from, to, fallbackLine = null, ...rideMapProps }) {
  const [route, setRoute] = useState(null);
  // Rounded signature: only refetch on real movement (~100m), not every poll.
  const sig =
    valid(from) && valid(to)
      ? `${r3(from.lat)},${r3(from.lng)},${r3(to.lat)},${r3(to.lng)}`
      : '';

  useEffect(() => {
    if (!sig) {
      setRoute(null);
      return undefined;
    }
    let cancelled = false;
    fetchRoute(from, to).then((r) => {
      if (!cancelled) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
    // from/to are captured via the rounded `sig`; refetch only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const line = route?.coords && route.coords.length >= 2 ? route.coords : fallbackLine;
  return <RideMap {...rideMapProps} line={line} />;
}
