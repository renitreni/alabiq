import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, LocateFixed, MapPin, Move, Search, Share2, X } from 'lucide-react';
import { api } from '../lib/api';
import { getCurrentPositionOnce, haversineKm } from '../lib/geo';
import RideMap from './RideMap';
import { btnGhost, btnPrimary, Field, inputClass, Spinner } from './ui';

function mapsLink(coords) {
  if (!coords?.lat || !coords?.lng) return '';
  return `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
}

export default function LocationPicker({
  label = 'Location',
  placeholder = 'Search nearby locations',
  address,
  coords,
  street,
  buildingNumber,
  onChange,
  showMap = true,
  requireStreetAndBuilding = false,
  className = '',
}) {
  const [query, setQuery] = useState(address || '');
  const [results, setResults] = useState([]);
  const [nearby, setNearby] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  // The last "use current location" or confirmed pin had no street name, so
  // the address is only coordinates until the customer types the rest.
  const [lookupFailed, setLookupFailed] = useState(false);

  // Street/building are fully controlled by the parent — no local mirror, so
  // there is nothing to keep in sync and no stale copy to leak into onChange.
  const streetInput = street || '';
  const buildingInput = buildingNumber || '';

  // Adjust-pin-on-map: a fixed pin sits at screen-center while the user pans
  // the map underneath it (RideMap `interactive`); nothing is committed to
  // onChange until "Confirm this location" — cancelling leaves address/coords
  // exactly as they were.
  const [adjusting, setAdjusting] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);
  const [pendingAddress, setPendingAddress] = useState('');
  const [pendingParts, setPendingParts] = useState({});
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingFailed, setPendingFailed] = useState(false);
  // Frozen at open: the map reads its camera once at creation, so this must
  // not follow `coords` afterwards or the map would recentre mid-adjust.
  const [adjustSeed, setAdjustSeed] = useState(null);
  const lastReverseRef = useRef(null);
  const reverseSeqRef = useRef(0);

  useEffect(() => {
    setQuery(address || '');
  }, [address]);

  // Google Places session token: shared across the autocomplete keystrokes and
  // the final Details lookup so the whole pick bills as ONE cheap session. Reset
  // after each successful pick (Details ends the session).
  const sessionTokenRef = useRef(null);
  function ensureToken() {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return sessionTokenRef.current;
  }

  const lastNearbyRef = useRef(null);
  useEffect(() => {
    if (!coords?.lat || !coords?.lng) {
      setNearby([]);
      lastNearbyRef.current = null;
      return undefined;
    }
    // Only refetch nearby when the pin moved a meaningful distance (~150m).
    // Small map nudges must NOT spam /nearby — that chattiness was a 429 driver.
    const prev = lastNearbyRef.current;
    const moved = !prev || (haversineKm(prev, { lat: coords.lat, lng: coords.lng }) ?? 1) > 0.15;
    if (!moved) return undefined;
    lastNearbyRef.current = { lat: coords.lat, lng: coords.lng };
    let alive = true;
    api.locationNearby(coords.lat, coords.lng)
      .then((data) => { if (alive) setNearby(data.places || []); })
      .catch(() => { if (alive) setNearby([]); });
    return () => { alive = false; };
  }, [coords?.lat, coords?.lng]);

  useEffect(() => {
    const q = query.trim();
    // Skip searching only when the query matches an address that is already a
    // confirmed selection (coords present). While the user is free-typing, coords
    // are null, so the autocomplete must still search — otherwise there is nothing
    // to pick and no way to attach real coordinates to the address.
    if (q.length < 3 || (q === (address || '').trim() && !!coords?.lat && !!coords?.lng)) {
      setResults([]);
      return undefined;
    }
    let alive = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const data = await api.locationSearch(q, coords || {}, ensureToken());
        if (alive) setResults(data.results || []);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setSearching(false);
      }
    }, 550);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, address, coords?.lat, coords?.lng]);

  const markers = useMemo(() => {
    const selected = coords?.lat && coords?.lng
      ? [{ ...coords, type: 'home', label: address || 'Selected location', key: 'selected' }]
      : [];
    const places = nearby.slice(0, 12).map((p) => ({
      lat: p.lat,
      lng: p.lng,
      glyph: '•',
      color: '#2563EB',
      label: p.name,
      key: `nearby-${p.id}`,
    }));
    return [...selected, ...places];
  }, [address, coords, nearby]);

  // Google Autocomplete predictions carry no coords — resolve them with a
  // Details lookup (shares the session token) on selection.
  async function choose(place) {
    setResults([]);
    setSearching(true);
    setError(null);
    try {
      let coordsOut = null;
      let finalAddress = place.name || place.address || query;
      if (place.lat != null && place.lng != null) {
        coordsOut = { lat: place.lat, lng: place.lng };
      } else if (place.id) {
        const data = await api.locationDetails(place.id, sessionTokenRef.current);
        if (data.place?.lat != null && data.place?.lng != null) {
          coordsOut = { lat: data.place.lat, lng: data.place.lng };
          finalAddress = data.place.address || finalAddress;
        }
      }
      sessionTokenRef.current = null; // Details ends the session — next search starts fresh.
      if (!coordsOut) {
        setQuery(place.name || query);
        setError('Could not pin that place. Try another result or use your current location.');
        return;
      }
      setQuery(finalAddress);
      setLookupFailed(false);
      onChange?.({ address: finalAddress, coords: coordsOut, street: streetInput, buildingNumber: buildingInput });
    } catch (err) {
      setError(err.message || 'Could not pin that place.');
    } finally {
      setSearching(false);
    }
  }

  // One-shot high-accuracy fix via the shared, Capacitor-aware helper — so this
  // picker (merchant + user pin-drop) uses native GPS in the APK, not just the
  // browser API.
  async function useCurrentLocation() {
    setLocating(true);
    setError(null);
    try {
      const pos = await getCurrentPositionOnce();
      const nextCoords = { lat: pos.lat, lng: pos.lng };
      let found = {};
      try {
        const data = await api.locationReverse(nextCoords.lat, nextCoords.lng);
        found = data.place || {};
      } catch {
        /* GPS still works even if reverse geocoding fails. */
      }
      const resolved = found.address || found.name || '';
      const nextAddress = resolved || coordLabel(nextCoords);
      setLookupFailed(!resolved);
      setQuery(nextAddress);
      onChange?.({ address: nextAddress, coords: nextCoords, ...withLookedUpParts(found) });
    } catch (err) {
      setError(err.message || 'Could not get your location. Please allow location access and try again.');
    } finally {
      setLocating(false);
    }
  }

  async function shareLocation() {
    if (!coords?.lat || !coords?.lng) return;
    const url = mapsLink(coords);
    const text = `${address || 'My location'}\n${url}`;
    if (navigator.share) {
      await navigator.share({ title: 'Alabiq location', text, url }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  // Google's street and building number fill the fields only when they are
  // empty: in KSA its numbers are estimates, and what the customer typed is
  // the better answer.
  function withLookedUpParts(found) {
    return {
      street: streetInput || found.street || '',
      buildingNumber: buildingInput || found.buildingNumber || '',
    };
  }

  function handleStreetChange(value) {
    onChange?.({ address, coords, street: value, buildingNumber: buildingInput });
  }

  function handleBuildingChange(value) {
    onChange?.({ address, coords, street: streetInput, buildingNumber: value });
  }

  // --- Adjust pin on map: fixed center pin, user pans the map underneath it.
  function startAdjusting() {
    const seed = coords?.lat && coords?.lng ? { lat: coords.lat, lng: coords.lng } : null;
    setPendingCoords(seed);
    setPendingAddress(address || '');
    setPendingParts({});
    // The map is created at this center, so the opening `idle` reports it back
    // — recording it here is what lets handleMapIdle skip that first lookup.
    lastReverseRef.current = seed;
    setAdjustSeed(seed);
    setAdjusting(true);
  }

  function cancelAdjusting() {
    setAdjusting(false);
    setPendingCoords(null);
    setPendingAddress('');
    setPendingParts({});
    setPendingFailed(false);
    lastReverseRef.current = null;
  }

  // When the lookup fails we still have exact coordinates, and coordinates are
  // what the driver actually navigates by — so show those rather than a vague
  // label. "Pinned location" alone would reach the rider as a delivery address
  // that names nowhere.
  function coordLabel({ lat, lng }) {
    return `Dropped pin (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  }

  // Fires once per pan/zoom gesture (Maps JS `idle`), never mid-drag — see
  // GoogleMap.jsx's comment on why `idle` and not `center_changed`.
  async function handleMapIdle({ lat, lng }) {
    setPendingCoords({ lat, lng });
    // The map fires `idle` once on open too. That first center is the pin we
    // just seeded, so re-geocoding it would spend a call to relabel it with
    // what it already says.
    const last = lastReverseRef.current;
    if (last && (haversineKm(last, { lat, lng }) ?? 1) < 0.01) return;
    lastReverseRef.current = { lat, lng };

    // Pans can outrun their reverse lookups: without this only the newest
    // request may write, or a slow first response would relabel a pin the
    // user has already moved on from.
    const seq = reverseSeqRef.current + 1;
    reverseSeqRef.current = seq;
    setPendingLoading(true);
    try {
      const data = await api.locationReverse(lat, lng);
      if (reverseSeqRef.current !== seq) return;
      const resolved = data.place?.address || data.place?.name || '';
      setPendingAddress(resolved || coordLabel({ lat, lng }));
      setPendingParts(data.place || {});
      setPendingFailed(!resolved);
    } catch {
      // Geocoding is down, rate-limited, or the spot has no street address.
      // The pin is still valid, so let them commit it — just never pretend we
      // resolved a name we did not.
      if (reverseSeqRef.current === seq) {
        setPendingAddress(coordLabel({ lat, lng }));
        setPendingParts({});
        setPendingFailed(true);
      }
    } finally {
      if (reverseSeqRef.current === seq) setPendingLoading(false);
    }
  }

  function confirmAdjusting() {
    if (!pendingCoords) return;
    const finalAddress = pendingAddress || coordLabel(pendingCoords);
    setQuery(finalAddress);
    setLookupFailed(pendingFailed);
    onChange?.({ address: finalAddress, coords: pendingCoords, ...withLookedUpParts(pendingParts) });
    setAdjusting(false);
    setPendingCoords(null);
    setPendingAddress('');
    setPendingParts({});
    setPendingFailed(false);
  }

  const optional = requireStreetAndBuilding ? ' *' : ' (optional)';
  const streetHint = (
    <p className="text-xs font-bold text-amber-700">
      We could not look up a street name here. The pin itself is still exact — add the street and
      building number above so your rider can find you.
    </p>
  );

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <span className="text-xs font-bold text-brand-grey uppercase tracking-wider block mb-1.5">
          {label}
        </span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey" />
          <input
            className={`${inputClass} pl-9 pr-10`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLookupFailed(false);
              // A hand-typed string is not a geocoded point — drop any stale coords so
              // coordinates only ever come from picking a result or "Use current location".
              onChange?.({ address: e.target.value, coords: null, street: streetInput, buildingNumber: buildingInput });
            }}
            placeholder={placeholder}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setLookupFailed(false);
                onChange?.({ address: '', coords: null, street: streetInput, buildingNumber: buildingInput });
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-brand-grey hover:bg-brand-surface"
              aria-label="Clear location"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label={`Street${optional}`}>
          <input
            className={inputClass}
            value={streetInput}
            onChange={(e) => handleStreetChange(e.target.value)}
            placeholder="e.g. King Fahd Rd"
            required={requireStreetAndBuilding}
            aria-required={requireStreetAndBuilding}
          />
        </Field>
        <Field label={`Building / house no.${optional}`}>
          <input
            className={inputClass}
            value={buildingInput}
            onChange={(e) => handleBuildingChange(e.target.value)}
            placeholder="e.g. 12"
            required={requireStreetAndBuilding}
            aria-required={requireStreetAndBuilding}
          />
        </Field>
      </div>
      {lookupFailed && !adjusting && !(streetInput.trim() && buildingInput.trim()) && streetHint}

      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={useCurrentLocation} disabled={locating} className={btnGhost + ' flex-1'}>
          {locating ? <Spinner /> : <LocateFixed className="w-4 h-4" />}
          {coords ? 'Update current location' : 'Use current location'}
        </button>
        <button type="button" onClick={shareLocation} disabled={!coords} className={btnPrimary + ' sm:w-auto'}>
          <Share2 className="w-4 h-4" />
          {copied ? 'Copied' : 'Share'}
        </button>
      </div>

      {(searching || results.length > 0 || error) && (
        <div className="rounded-2xl border border-brand-border bg-white overflow-hidden">
          {searching && <div className="px-3 py-2 text-xs text-brand-grey font-bold">Searching nearby...</div>}
          {error && <div className="px-3 py-2 text-xs text-red-600 font-bold">{error}</div>}
          {results.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => choose(place)}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-brand-surface border-t first:border-t-0 border-brand-border"
            >
              <MapPin className="w-4 h-4 text-brand-orange shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-brand-dark truncate">{place.name}</span>
                <span className="block text-xs text-brand-grey truncate">{place.address}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {showMap && adjusting && (
        <div className="space-y-2">
          <RideMap markers={[]} height={260} interactive onIdle={handleMapIdle} initialCenter={adjustSeed}>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <MapPin
                className="w-9 h-9 text-brand-orange -translate-y-1/2 drop-shadow-md"
                fill="currentColor"
                strokeWidth={1.5}
              />
            </div>
            <span className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm border border-brand-border rounded-lg px-3 py-1.5 text-[11px] font-bold text-brand-dark shadow-sm pointer-events-none">
              Drag the map to move the pin
            </span>
          </RideMap>
          <p className="text-xs text-brand-grey min-h-[1em]">
            {pendingLoading ? 'Locating...' : pendingAddress || 'Pan the map to drop the pin.'}
          </p>
          {pendingFailed && !pendingLoading && streetHint}
          <div className="flex gap-2">
            <button type="button" onClick={cancelAdjusting} className={btnGhost + ' flex-1'}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmAdjusting}
              disabled={!pendingCoords}
              className={btnPrimary + ' flex-1'}
            >
              <Check className="w-4 h-4" />
              Confirm this location
            </button>
          </div>
        </div>
      )}

      {showMap && !adjusting && (
        <div className="space-y-2">
          <RideMap
            markers={markers}
            height={260}
            legend={[
              coords && { glyph: 'H', color: '#FF7E21', label: 'Selected location' },
              nearby.length > 0 && { glyph: '•', color: '#2563EB', label: 'Nearby places' },
            ].filter(Boolean)}
          >
            <button
              type="button"
              onClick={startAdjusting}
              className="absolute top-3 right-3 z-[400] inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm border border-brand-border rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-brand-dark shadow-sm hover:bg-brand-surface"
            >
              <Move className="w-3.5 h-3.5 text-brand-orange" />
              Adjust pin
            </button>
          </RideMap>
          <p className="text-xs text-brand-grey">
            {nearby.length > 0
              ? `${nearby.length} nearby places found around this pin.`
              : 'Search or use your current location to show nearby places on the map.'}
          </p>
        </div>
      )}
    </div>
  );
}
