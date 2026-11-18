// ---------------------------------------------------------------------

// Driver portal (Grab-style). Identity comes from the signed-in API

// session; a driver must be admin-approved before they can go online.

// ---------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

import {

  Power,

  MessageCircle,

  MapPin,

  Flag,

  Navigation,

  Check,

  ShieldAlert,

  User,

  Radio,

  Clock,

  ChevronRight,

  Utensils,

  ShoppingBag,

} from 'lucide-react';

import { api } from '../lib/api';

import { useAuth } from '../lib/AuthProvider';

import { useGeolocation, haversineKm, etaMinutes, movementFrom, bearingDeg, parseCoord, resolveCoordsFromAddress } from '../lib/geo';

import { useBroadcast } from '../lib/useBroadcast';

import { realtimeEnabled } from '../lib/gatewayClient';

import DriverVerification from './DriverVerification';

import DriverDispatch from './DriverDispatch';

import { whatsappLink, googleMapsNavLink } from '../lib/constants';
import { formatAddressDetail } from '../lib/address';
import { notifyAlert } from '../lib/notify';

import { PortalShell, Card, Badge, Spinner, btnPrimary } from '../components/ui';

import RoutedRideMap from '../components/RoutedRideMap';



const ACTIVE = ['accepted', 'on_the_way', 'arrived', 'started'];

// How often the device posts GPS. Fast enough that the customer's map has a
// fix to glide toward at all times — the previous 12s left their marker
// visibly frozen between updates. The backend throttles what it stores and
// re-broadcasts, so a quicker ping here does not multiply database rows or
// Realtime messages. Stays under the 30/min POST /location rate limit.
const PING_MS = 4000;

// The open-ride feed. Unchanged: new requests do not appear fast enough to
// justify polling it at GPS cadence.
const AVAILABLE_POLL_MS = 12000;

// Driver service-type preferences (profiles.service_types, migration 0020).
// 'shop' = Ecommerce. Live since the dispatch cascade learned a third job
// kind; the rider queue merges food and shop deliveries.
const ALL_SERVICES = ['pick_drop', 'food', 'shop'];

const SERVICE_OPTIONS = [
  { id: 'pick_drop', label: 'Pick & Drop', subtitle: 'Airport rides', icon: Navigation },
  { id: 'food', label: 'Food delivery', subtitle: 'Restaurant orders', icon: Utensils },
  { id: 'shop', label: 'Ecommerce', subtitle: 'Store and parcel orders', icon: ShoppingBag },
];

const RIDE_STEPS = [

  { key: 'accepted', label: 'Accepted' },

  { key: 'on_the_way', label: 'En route' },

  { key: 'arrived', label: 'Arrived' },

  { key: 'started', label: 'On trip' },

];

const NEXT = {

  accepted: { status: 'on_the_way', label: 'Start heading to pickup' },

  on_the_way: { status: 'arrived', label: "I've arrived at pickup" },

  arrived: { status: 'started', label: 'Start trip to drop-off' },

  started: { status: 'completed', label: 'Complete trip' },

};

const STATUS_LABELS = {

  accepted: 'New ride accepted',

  on_the_way: 'Heading to client',

  arrived: 'Waiting at pickup',

  started: 'Trip in progress',

};



// A coordinate pair only if BOTH sides are really present. Deliberately does
// not fall back to resolveCoordsFromAddress: this feeds the navigation deep
// link, where an invented centroid would send a driver to the wrong street.
function exactPoint(lat, lng) {

  const la = parseCoord(lat);

  const ln = parseCoord(lng);

  return la != null && ln != null ? { lat: la, lng: ln } : null;

}



function normRide(r) {

  if (!r) return null;

  const pickupAddress = r.pickupAddress || r.pickup_address;

  const dropoffAddress = r.dropoffAddress || r.dropoff_address;

  // The coordinates EXACTLY as the customer picked them — parsed, never
  // guessed. Null when the booking genuinely has no pin.
  const pickupExact = exactPoint(r.pickupLat ?? r.pickup_lat, r.pickupLng ?? r.pickup_lng);

  const dropoffExact = exactPoint(r.dropoffLat ?? r.dropoff_lat, r.dropoffLng ?? r.dropoff_lng);

  // ...and the map's version, which falls back to an airport / district /
  // city centroid so an unpinned booking still renders something. Fine for a
  // marker, NEVER for navigation — see googleMapsNavLink in lib/constants.js.

  const pickupCoords = resolveCoordsFromAddress(

    pickupAddress,

    parseCoord(r.pickupLat ?? r.pickup_lat),

    parseCoord(r.pickupLng ?? r.pickup_lng)

  );

  const dropoffCoords = resolveCoordsFromAddress(

    dropoffAddress,

    parseCoord(r.dropoffLat ?? r.dropoff_lat),

    parseCoord(r.dropoffLng ?? r.dropoff_lng)

  );

  return {

    pickupExact,

    dropoffExact,

    bookingCode: r.bookingCode || r.booking_code,

    tripType: r.tripType || r.trip_type,

    airportTerminal: r.airportTerminal || r.airport_terminal,

    pickupAddress,

    // What the driver reads on screen: building/street first, then the
    // geocoded address. Navigation still uses the coords, never this string.
    pickupDisplay: formatAddressDetail({
      street: r.pickupStreet || r.pickup_street,
      building: r.pickupBuilding || r.pickup_building,
      address: pickupAddress,
    }),

    pickupLat: pickupCoords?.lat ?? null,

    pickupLng: pickupCoords?.lng ?? null,

    dropoffAddress,

    dropoffDisplay: formatAddressDetail({
      street: r.dropoffStreet || r.dropoff_street,
      building: r.dropoffBuilding || r.dropoff_building,
      address: dropoffAddress,
    }),

    dropoffLat: dropoffCoords?.lat ?? null,

    dropoffLng: dropoffCoords?.lng ?? null,

    fareAmount: r.fareAmount ?? r.fare_amount,

    passengerName: r.passengerName || r.passenger_name,

    passengerWhatsapp: r.passengerWhatsapp || r.passenger_whatsapp,

    driverRideStatus: r.driverRideStatus || r.driver_ride_status,

    bookingStatus: r.bookingStatus || r.booking_status,

  };

}



function RideProgress({ status }) {

  const idx = RIDE_STEPS.findIndex((s) => s.key === status);

  return (

    <div className="driver-step-track mb-4">

      {RIDE_STEPS.map((step, i) => (

        <div key={step.key} className="space-y-1.5">

          <div

            className={`driver-step-bar ${i <= idx ? (i === idx ? 'is-active' : 'is-done') : ''}`}

            title={step.label}

          />

          <span className={`block text-[9px] font-bold uppercase tracking-wide truncate ${

            i <= idx ? 'text-brand-orange' : 'text-brand-grey/70'

          }`}

          >

            {step.label}

          </span>

        </div>

      ))}

    </div>

  );

}



function OnlineToggle({ online, coords, driverMove, onToggle }) {

  return (

    <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/90 backdrop-blur-md border border-white/80 shadow-lg shadow-black/5">

      <div className="flex items-center gap-3 min-w-0">

        <div className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${

          online ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-brand-surface text-brand-grey'

        }`}

        >

          <Power className="w-5 h-5" />

          {online && (

            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-white border-2 border-emerald-500 admin-live-dot" />

          )}

        </div>

        <div className="min-w-0">

          <div className="font-black text-brand-black text-sm leading-tight">

            {online ? 'You\'re online' : 'You\'re offline'}

          </div>

          <div className="text-[11px] text-brand-grey truncate mt-0.5">

            {online

              ? coords

                ? driverMove.moving && driverMove.speedKmh != null

                  ? `Moving · ~${Math.round(driverMove.speedKmh)} km/h`

                  : 'Ready for rides · GPS active'

                : 'Locating you…'

              : 'Go online to receive requests'}

          </div>

        </div>

      </div>

      <button

        type="button"

        onClick={onToggle}

        className={`shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${

          online

            ? 'bg-brand-surface text-brand-dark hover:bg-brand-border border border-brand-border'

            : 'bg-brand-orange text-white hover:bg-brand-orange/90 shadow-md shadow-brand-orange/25'

        }`}

      >

        {online ? 'Go offline' : 'Go online'}

      </button>

    </div>

  );

}



// Which verticals this driver works. Multi-select; at least one must stay on.
// Saved to the profile so dispatch and the pull feeds respect it server-side.
function ServiceToggles({ services, onToggle, saving }) {
  return (
    <div className="p-3.5 rounded-2xl bg-white/90 backdrop-blur-md border border-white/80 shadow-lg shadow-black/5">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="font-black text-brand-black text-sm">My services</div>
        <div className="text-[11px] text-brand-grey">Choose the work you take</div>
      </div>
      <div className="divide-y divide-brand-border/40">
        {SERVICE_OPTIONS.map((opt) => {
          const on = services.includes(opt.id);
          const Icon = opt.icon;
          return (
            <div key={opt.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    on ? 'bg-brand-orange/10 text-brand-orange' : 'bg-brand-surface text-brand-grey'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-brand-dark text-sm leading-tight">{opt.label}</span>
                    {opt.comingSoon && <Badge tone="grey">Coming soon</Badge>}
                  </div>
                  <div className="text-[11px] text-brand-grey truncate mt-0.5">{opt.subtitle}</div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${opt.label} ${on ? 'on' : 'off'}`}
                disabled={saving}
                onClick={() => onToggle(opt.id)}
                className={`relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-60 ${
                  on ? 'bg-emerald-500' : 'bg-brand-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    on ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}



function ActiveRidePanel({ ride, here, busyCode, onAdvance, onCancel }) {

  const started = ride.driverRideStatus === 'started';

  // Approximate target, for the on-screen distance + ETA readout only. The
  // resolved coords are acceptable here: a roughly-right ETA beats none.

  const navTarget = started

    ? { lat: ride.dropoffLat, lng: ride.dropoffLng }

    : { lat: ride.pickupLat, lng: ride.pickupLng };

  // Turn-by-turn, on the other hand, must go to the coordinates the customer
  // actually picked — never a district or city centroid. Falls back to their
  // address text, and to nothing at all (button hidden) if we have neither.

  const navUrl = googleMapsNavLink(

    started

      ? { ...ride.dropoffExact, address: ride.dropoffAddress }

      : { ...ride.pickupExact, address: ride.pickupAddress }

  );

  const distToTarget = here && navTarget.lat != null ? haversineKm(here, navTarget) : null;

  const eta = distToTarget != null ? etaMinutes(distToTarget) : null;

  const next = NEXT[ride.driverRideStatus];

  const wa = whatsappLink(ride.passengerWhatsapp, `Hi, I'm your Alabiq driver for ${ride.bookingCode}`);



  return (

    <Card className="driver-panel overflow-hidden border-0">

      <div className="bg-gradient-to-br from-brand-orange/10 via-white to-blue-50/40 px-5 pt-5 pb-4 border-b border-brand-border/60">

        <div className="flex items-start justify-between gap-3 mb-1">

          <div>

            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-orange mb-1">Active ride</p>

            <h2 className="font-black text-lg text-brand-black leading-tight">

              {STATUS_LABELS[ride.driverRideStatus] || ride.driverRideStatus}

            </h2>

          </div>

          <div className="text-right shrink-0">

            <div className="text-[10px] font-bold text-brand-grey uppercase">Fare</div>

            <div className="font-black text-xl text-brand-orange leading-none mt-0.5">SAR {ride.fareAmount}</div>

          </div>

        </div>

        <RideProgress status={ride.driverRideStatus} />

      </div>



      <div className="p-5 space-y-4">

        <div className="flex items-center gap-3 p-3 rounded-2xl bg-brand-muted/80 border border-brand-border/60">

          <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">

            <User className="w-5 h-5" />

          </div>

          <div className="min-w-0 flex-1">

            <div className="text-[10px] font-bold text-brand-grey uppercase">Passenger</div>

            <div className="font-bold text-brand-black truncate">{ride.passengerName}</div>

            <div className="text-[11px] font-mono text-brand-grey">{ride.bookingCode}</div>

          </div>

          {eta != null && (

            <div className="text-right shrink-0 pl-2">

              <div className="inline-flex items-center gap-1 text-brand-orange font-black text-sm">

                <Clock className="w-3.5 h-3.5" />

                {eta} min

              </div>

              {distToTarget != null && (

                <div className="text-[10px] text-brand-grey font-bold mt-0.5">{distToTarget.toFixed(1)} km away</div>

              )}

            </div>

          )}

        </div>



        <div className="space-y-0">

          <div className="flex gap-3">

            <div className="flex flex-col items-center pt-1">

              <span className="w-3.5 h-3.5 rounded-full bg-blue-500 ring-4 ring-blue-500/20 shrink-0" />

              <div className="driver-route-line flex-1 my-1" />

            </div>

            <div className="pb-3 min-w-0 flex-1">

              <div className="text-[10px] font-bold text-brand-grey uppercase mb-0.5">Pickup · Client</div>

              <div className="text-sm font-semibold text-brand-dark leading-snug">{ride.pickupDisplay}</div>

            </div>

          </div>

          <div className="flex gap-3">

            <div className="flex flex-col items-center pt-1">

              <span className="w-3.5 h-3.5 rounded-full bg-brand-dark ring-4 ring-brand-dark/15 shrink-0" />

            </div>

            <div className="min-w-0 flex-1">

              <div className="text-[10px] font-bold text-brand-grey uppercase mb-0.5">Drop-off</div>

              <div className="text-sm font-semibold text-brand-dark leading-snug">{ride.dropoffDisplay}</div>

            </div>

          </div>

        </div>



        {next && (

          <button

            type="button"

            onClick={() => onAdvance(ride.bookingCode, next.status)}

            disabled={busyCode === ride.bookingCode}

            className={btnPrimary + ' w-full !py-3.5 !text-base !rounded-2xl'}

          >

            {busyCode === ride.bookingCode ? (

              <Spinner className="!border-white/40 !border-t-white" />

            ) : (

              <>

                <ChevronRight className="w-5 h-5" />

                {next.label}

              </>

            )}

          </button>

        )}



        <div className="grid grid-cols-2 gap-2.5">

          {wa && (

            <a

              href={wa}

              target="_blank"

              rel="noreferrer"

              className="inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold

                bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"

            >

              <MessageCircle className="w-4 h-4 shrink-0" />

              Message

            </a>

          )}

          {navUrl && (

            <a

              href={navUrl}

              target="_blank"

              rel="noreferrer"

              className={`inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold

                bg-brand-dark text-white hover:bg-black transition-colors ${!wa ? 'col-span-2' : ''}`}

            >

              <Navigation className="w-4 h-4 shrink-0" />

              Google Maps

            </a>

          )}

        </div>

        {/* Give up the ride — only before the trip starts. It's re-offered to
            the next-nearest driver (the passenger keeps their booking). */}

        {ride.driverRideStatus !== 'started' && (

          <button

            type="button"

            disabled={busyCode === ride.bookingCode}

            onClick={() => onCancel(ride.bookingCode)}

            className="w-full mt-2.5 text-xs font-bold text-brand-grey hover:text-red-600 py-1.5 cursor-pointer"

          >

            Can't make it? Cancel &amp; pass it on

          </button>

        )}

      </div>

    </Card>

  );

}



function RequestCard({ ride, dist, busyCode, onAccept }) {

  return (

    <div className="group p-4 rounded-2xl border border-brand-border/80 bg-white hover:border-brand-orange/40 hover:shadow-md hover:shadow-brand-orange/5 transition-all">

      <div className="flex items-start justify-between gap-2 mb-2">

        <span className="font-mono text-[11px] font-bold text-brand-grey bg-brand-muted px-2 py-0.5 rounded-md">

          {ride.bookingCode}

        </span>

        {dist != null && (

          <span className="inline-flex items-center gap-1 text-xs font-black text-brand-orange shrink-0">

            <Clock className="w-3 h-3" />

            {dist.toFixed(1)} km · ~{etaMinutes(dist)} min

          </span>

        )}

      </div>

      <div className="space-y-1.5 mb-3">

        <div className="flex gap-2 text-sm text-brand-dark">

          <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />

          <span className="line-clamp-2 leading-snug">{ride.pickupDisplay}</span>

        </div>

        <div className="flex gap-2 text-sm text-brand-grey">

          <Flag className="w-4 h-4 text-brand-dark shrink-0 mt-0.5" />

          <span className="line-clamp-1">{ride.dropoffDisplay}</span>

        </div>

      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-brand-border/60">

        <span className="font-black text-brand-orange">SAR {ride.fareAmount}</span>

        <button

          type="button"

          onClick={() => onAccept(ride.bookingCode)}

          disabled={busyCode === ride.bookingCode}

          className={btnPrimary + ' !py-2 !px-5 !rounded-xl !text-sm'}

        >

          {busyCode === ride.bookingCode ? <Spinner className="!border-white/40 !border-t-white" /> : 'Accept ride'}

        </button>

      </div>

    </div>

  );

}



export default function DriverPage() {

  const { driverApproved, profile, refreshProfile } = useAuth();

  const [online, setOnline] = useState(false);

  // Which verticals this driver works. `null` until the first local edit, so a
  // late-arriving profile is picked up without a seeding effect. Empty is never
  // allowed (kept in sync with profiles.service_types via api.driverServices).
  const [services, setServices] = useState(null);

  const [savingServices, setSavingServices] = useState(false);

  const effectiveServices = services || profile?.serviceTypes || ALL_SERVICES;

  const ridesEnabled = effectiveServices.includes('pick_drop');

  // One rider queue covers both delivery verticals, so the panel shows when
  // EITHER is enabled; the backend filters each pool by the rider's own
  // service_types regardless.
  const foodEnabled = effectiveServices.includes('food') || effectiveServices.includes('shop');

  // A rider carrying an active food/shop delivery must keep sending GPS even
  // when they haven't toggled "online" for ride offers — otherwise the
  // customer's live tracking map has no pin. DriverDispatch reports this up as
  // the current leg's destination ({lat,lng}), or null when idle, so the map
  // below can also frame and follow the rider against where they're heading.
  const [deliveryTarget, setDeliveryTarget] = useState(null);

  const hasActiveDelivery = !!deliveryTarget;

  const [available, setAvailable] = useState([]);

  const [activeRide, setActiveRide] = useState(null);

  const [error, setError] = useState(null);
  const [busyCode, setBusyCode] = useState(null);

  const [lastPayout, setLastPayout] = useState(null);

  const [cash, setCash] = useState(null); // { cashOwed, cashOwedLimit, blocked, warning }

  const [driverMove, setDriverMove] = useState({ speedKmh: null, moving: false, heading: null });

  const prevCoordRef = useRef(null);

  // Visibility for the location ping (previously failed 100% silently — see
  // the tick() effect below): a short streak of failures, or a definitive
  // 401/403 that won't self-heal by just trying again.
  const [pingFailStreak, setPingFailStreak] = useState(0);

  const [pingAuthIssue, setPingAuthIssue] = useState(false);



  // Keep GPS on whenever the rider has live work — an active ride (Pick & Drop)
  // OR an active food delivery — so the customer/passenger map is fed even when
  // they aren't toggled "online" for new offers.
  const { coords, error: geoError } = useGeolocation({ watch: true, enabled: online || hasActiveDelivery || !!activeRide });

  const coordsRef = useRef(coords);

  coordsRef.current = coords;



  useEffect(() => {

    if (!coords) return;

    const now = Date.now();

    const prev = prevCoordRef.current;

    if (prev && (prev.lat !== coords.lat || prev.lng !== coords.lng)) {

      const dt = (now - prev.t) / 1000;

      const derived = movementFrom(prev, coords, dt);

      setDriverMove({

        ...derived,

        // The chip's own readings beat anything derived from two fixes: no
        // lag, no jitter from GPS wander at a standstill. Fall back only when
        // the device does not report them (desktop, or stationary).

        speedKmh: coords.speedKmh ?? derived.speedKmh,

        heading: coords.heading ?? bearingDeg(prev, coords),

      });

    }

    prevCoordRef.current = { lat: coords.lat, lng: coords.lng, t: now };

  }, [coords?.lat, coords?.lng]);



  const loadActive = useCallback(async () => {

    try {

      const { rides } = await api.driverRides();

      const active = (rides || []).map(normRide).find((r) => ACTIVE.includes(r.driverRideStatus));

      setActiveRide(active || null);

    } catch (err) { setError(err.message); }

  }, []);



  const loadAvailable = useCallback(async () => {

    const c = coordsRef.current;

    try {

      const { rides } = await api.driverAvailable(c?.lat, c?.lng);

      setAvailable((rides || []).map(normRide));

    } catch (err) { setError(err.message); }

  }, []);



  const loadCash = useCallback(async () => {

    try { setCash(await api.driverCash()); } catch { /* non-blocking */ }

  }, []);



  useEffect(() => { if (driverApproved) { loadActive(); loadCash(); } }, [driverApproved, loadActive, loadCash]);



  // GPS ping. Deliberately separate from the ride-feed poll below: the
  // customer's map needs frequent fixes to animate smoothly, but the open-ride
  // list changes on human timescales and re-fetching it this often would be
  // three times the requests for no new information (and would eat into the
  // API's general rate limit).
  useEffect(() => {

    if ((!online && !hasActiveDelivery && !activeRide) || !driverApproved) return undefined;

    let stop = false;

    const tick = async () => {

      const c = coordsRef.current;

      if (!c) return;

      try {

        await api.driverLocation({
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          // Straight from the device compass when it has one. Sending it lets
          // the customer's car icon face the right way immediately, instead of
          // pointing due north until two fixes have accumulated. Null on
          // desktop and while parked — the backend accepts that.
          heading: c.heading,
          speed_kmh: c.speedKmh,
        });

        if (!stop) { setPingFailStreak(0); setPingAuthIssue(false); }

      } catch (err) {

        // Previously swallowed completely — a driver could move for their
        // whole shift while every ping silently failed (expired session,
        // revoked approval, a transient 500/429) and nothing on screen or
        // in the logs would show it. Surface it instead of hiding it.

        console.error('driver location ping failed:', err.status, err.message);

        if (!stop) setPingFailStreak((n) => n + 1);

        if (err.status === 401 || err.status === 403) {

          if (!stop) setPingAuthIssue(true);

          // The dashboard's "online/approved" view may be running on a stale
          // cached profile — re-sync so it reflects what the backend just
          // enforced (e.g. approval revoked mid-shift) instead of continuing
          // to look normal while every ping is rejected.

          refreshProfile?.();

        }

      }

    };

    tick();

    const id = setInterval(tick, PING_MS);

    return () => { stop = true; clearInterval(id); };

  }, [online, hasActiveDelivery, driverApproved, activeRide, refreshProfile]);



  // Open-ride feed, kept at its original cadence.
  useEffect(() => {

    if (!online || !driverApproved || !ridesEnabled || activeRide) return undefined;

    let stop = false;

    const tick = () => { if (!stop) loadAvailable(); };

    tick();

    const id = setInterval(tick, AVAILABLE_POLL_MS);

    return () => { stop = true; clearInterval(id); };

  }, [online, driverApproved, ridesEnabled, activeRide, loadAvailable]);



  useBroadcast(

    'drivers-available',

    {

      // Both handlers refetch instead of rendering the broadcast payload.
      // `drivers-available` is joinable by anyone holding the anon key, which
      // ships in the bundle and the APK, so the payload now carries nothing:
      // it used to include both addresses, both coordinate pairs, the fare
      // and the booking code. loadAvailable() goes through the authenticated
      // endpoint, so the same data arrives -- just to drivers only.
      new_request: () => {
        notifyAlert('New ride request nearby', { icon: 'info' });
        loadAvailable();
      },

      request_taken: () => {
        loadAvailable();
      },

    },

    realtimeEnabled && online && ridesEnabled && driverApproved && !activeRide

  );



  async function toggleService(type) {

    const cur = effectiveServices;

    const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];

    if (next.length === 0) { setError('Keep at least one service type enabled.'); return; }

    setServices(next); setError(null); setSavingServices(true);

    try {

      const res = await api.driverServices(next);

      setServices(res.serviceTypes);

      refreshProfile?.(); // fire-and-forget: keep AuthProvider fresh across remounts

    } catch (err) { setServices(cur); setError(err.message); } finally { setSavingServices(false); }

  }



  // Turning Pick & Drop off clears any ride requests already on screen.

  useEffect(() => { if (!ridesEnabled) setAvailable([]); }, [ridesEnabled]);



  async function accept(code) {

    setBusyCode(code); setError(null);

    try {

      await api.driverAccept(code);

      setAvailable((list) => list.filter((x) => x.bookingCode !== code));

      await loadActive();

    } catch (err) { setError(err.message); await loadAvailable(); } finally { setBusyCode(null); }

  }



  async function advance(code, status) {

    setBusyCode(code); setError(null);

    try {

      const res = await api.driverStatus(code, status, coords);

      if (status === 'completed') {

        setLastPayout(res.ledger);

        setActiveRide(null);

        loadAvailable();

        loadCash(); // a cash ride just added to what the driver owes us

      } else {

        await loadActive();

      }

    } catch (err) { setError(err.message); } finally { setBusyCode(null); }

  }

  async function cancelRide(code) {
    if (!window.confirm('Cancel this ride? It will be offered to the next-nearest driver.')) return;
    setBusyCode(code); setError(null);
    try {
      await api.driverCancelRide(code, undefined);
      setActiveRide(null);
      loadAvailable();
    } catch (err) { setError(err.message); } finally { setBusyCode(null); }
  }



  if (!driverApproved) {

    return (

      <PortalShell title="Driver" subtitle={profile?.fullName || ''}>

        <div className="max-w-lg mx-auto">

          <DriverVerification />

        </div>

      </PortalShell>

    );

  }



  const here = coords ? { lat: coords.lat, lng: coords.lng } : null;

  // ~36s of sustained failure (3 ticks at 12s) — long enough to ignore a
  // one-off network blip, short enough to warn before a customer notices a
  // frozen dot on their tracking page.
  const pingBroken = pingAuthIssue || pingFailStreak >= 3;



  let markers = [];

  let line = null;

  let routeFrom = null;

  let routeTo = null;

  if (activeRide) {

    markers = [

      here && { ...here, type: 'driver', label: 'You', key: 'me', heading: driverMove.heading },

      activeRide.pickupLat != null && {

        lat: activeRide.pickupLat,

        lng: activeRide.pickupLng,

        type: 'passenger',

        label: activeRide.passengerName || 'Client',

        key: 'client',

      },

      activeRide.dropoffLat != null && { lat: activeRide.dropoffLat, lng: activeRide.dropoffLng, type: 'dropoff', label: 'Drop-off', key: 'd' },

    ].filter(Boolean);

    if (here && activeRide.pickupLat != null && activeRide.driverRideStatus !== 'started') {

      line = [here, { lat: activeRide.pickupLat, lng: activeRide.pickupLng }];

      routeFrom = here;

      routeTo = { lat: activeRide.pickupLat, lng: activeRide.pickupLng };

    }

  } else {

    markers = [

      here && { ...here, type: 'driver', label: 'You', key: 'me', heading: driverMove.heading },

      ...available.filter((r) => r.pickupLat != null).map((r) => ({

        lat: r.pickupLat,

        lng: r.pickupLng,

        type: 'pickup',

        label: r.pickupAddress,

        key: r.bookingCode,

      })),

    ].filter(Boolean);

  }



  // Where this rider is heading right now. Falls through to the delivery leg
  // when there is no ride: a rider on a food/shop job used to get neither a
  // target nor camera follow, so their own map sat still while they drove.
  //
  // Built from the EXACT customer-picked coordinates, plus the address as a
  // fallback for the navigation link. It deliberately does not use
  // pickupLat/dropoffLat: those have been through resolveCoordsFromAddress
  // and may be an airport / district / city centroid, which is acceptable for
  // the map marker and wrong for turn-by-turn.

  const navTarget = activeRide

    ? activeRide.driverRideStatus === 'started'

      ? { ...activeRide.dropoffExact, address: activeRide.dropoffAddress }

      : { ...activeRide.pickupExact, address: activeRide.pickupAddress }

    : deliveryTarget;



  const clientDist = here && activeRide?.pickupLat != null

    ? haversineKm(here, { lat: activeRide.pickupLat, lng: activeRide.pickupLng })

    : null;

  const clientFarAway = clientDist != null && clientDist > 80;



  const mapLegend = [

    here && { glyph: '●', color: '#FF7E21', label: 'You' },

    activeRide

      ? { glyph: 'C', color: '#2563EB', label: 'Client' }

      : { glyph: 'P', color: '#FF7E21', label: 'Requests' },

    activeRide && { glyph: 'D', color: '#1F2937', label: 'Drop-off' },

  ].filter(Boolean);



  const sortedAvailable = [...available]

    .map((r) => ({ ...r, dist: here ? haversineKm(here, { lat: r.pickupLat, lng: r.pickupLng }) : null }))

    .sort((a, b) => (a.dist == null ? 1 : b.dist == null ? -1 : a.dist - b.dist));



  return (

    <PortalShell

      wide

      title="Driver"

      subtitle={online ? 'Online · receiving rides' : 'Offline'}

      right={

        online && realtimeEnabled ? (

          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">

            <Radio className="w-3 h-3" />

            Live

          </span>

        ) : null

      }

    >

      <div className="driver-shell -mx-1 px-1 pb-2">

        {error && (

          <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">

            {error}

          </div>

        )}



        {(geoError || pingBroken || ((hasActiveDelivery || activeRide) && !coords)) && (online || hasActiveDelivery || activeRide) && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <span className="font-bold">
              {pingBroken ? "Your live location isn't reaching Alabiq." : 'Location access is needed.'}
            </span>{' '}
            {pingAuthIssue
              ? 'Your driver approval or session may have changed — please sign out and back in.'
              : pingBroken
                ? 'Customers may see you stuck on the map until this clears up — check your connection.'
                : hasActiveDelivery || activeRide
                  ? 'Please allow location / turn on GPS for this site so your customer can track you live on the map.'
                  : 'Please turn on location so we can match you to nearby jobs.'}
            {geoError ? ` (${geoError})` : ''}
          </div>
        )}

        {/* Cash owed to Alabiq from cash pick & drop rides. */}
        {cash && cash.cashOwed > 0 && (
          <div className={`mb-4 p-3.5 rounded-2xl border text-sm ${
            cash.blocked
              ? 'bg-red-50 border-red-200 text-red-800'
              : cash.warning
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-brand-warm border-brand-orange/30 text-brand-dark'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold">Cash owed to Alabiq</span>
              <span className="font-black tabular-nums">SAR {Number(cash.cashOwed).toFixed(2)}</span>
            </div>
            <p className="text-xs mt-1 opacity-90">
              {cash.blocked
                ? `You've hit your SAR ${Number(cash.cashOwedLimit).toFixed(2)} limit — you can't accept new cash rides until you settle with Alabiq.`
                : `Settle weekly with Alabiq. Limit SAR ${Number(cash.cashOwedLimit).toFixed(2)}.`}
            </p>
          </div>
        )}

        {/* Grab-style dispatch: exclusive 30s offers + food deliveries. */}
        <DriverDispatch
          online={online}
          foodEnabled={foodEnabled}
          driverId={profile?.id}
          coords={coords}
          onRideAccepted={loadActive}
          onActiveDeliveryChange={setDeliveryTarget}
        />



        {lastPayout && !activeRide && (

          <div className="mb-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">

            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">

              <Check className="w-5 h-5" />

            </div>

            <div>

              <div className="font-black text-emerald-800">Trip completed</div>

              <div className="text-sm text-emerald-700">

                Payout <b>SAR {lastPayout.driverNet}</b> · {lastPayout.payoutStatus}

              </div>

            </div>

          </div>

        )}



        <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 lg:items-start">

          <div className="flex-1 min-w-0 space-y-3 lg:sticky lg:top-20">

            <div className="relative driver-map-frame rounded-3xl overflow-hidden border border-brand-border/50 bg-white">

              <RoutedRideMap

                markers={markers}

                from={routeFrom}

                to={routeTo}

                fallbackLine={line}

                legend={mapLegend}

                height={activeRide ? 420 : 460}

                className="!rounded-none !border-0 !shadow-none"

                follow={(!!activeRide || hasActiveDelivery) && !!here}

                followTarget={navTarget}

              />



              {clientFarAway && activeRide && (

                <div className="absolute top-3 left-3 right-3 z-[400] pointer-events-none">

                  <div className="bg-amber-50/95 backdrop-blur-sm border border-amber-200 text-amber-900 text-xs font-medium px-3 py-2 rounded-xl shadow-sm">

                    Client pickup is in Riyadh ({clientDist.toFixed(0)} km away). Map shows your area — use Google Maps to navigate.

                  </div>

                </div>

              )}



              {activeRide && !clientFarAway && clientDist != null && (

                <div className="absolute top-3 right-3 z-[400] pointer-events-none">

                  <div className="bg-white/95 backdrop-blur-sm border border-brand-border px-3 py-2 rounded-xl shadow-lg text-right">

                    <div className="text-[10px] font-bold text-brand-grey uppercase">To client</div>

                    <div className="font-black text-brand-black">{clientDist.toFixed(1)} km · ~{etaMinutes(clientDist)} min</div>

                  </div>

                </div>

              )}

            </div>



            <OnlineToggle

              online={online}

              coords={coords}

              driverMove={driverMove}

              onToggle={() => setOnline((v) => !v)}

            />

            <ServiceToggles

              services={effectiveServices}

              onToggle={toggleService}

              saving={savingServices}

            />

          </div>


          <div className="lg:w-[400px] shrink-0 space-y-4">

            {activeRide ? (

              <ActiveRidePanel

                ride={activeRide}

                here={here}

                busyCode={busyCode}

                onAdvance={advance}

                onCancel={cancelRide}

              />

            ) : (

              <Card className="driver-panel border-0 overflow-hidden">

                <div className="px-5 pt-5 pb-3 border-b border-brand-border/60">

                  <div className="flex items-center justify-between gap-2">

                    <div>

                      <h2 className="font-black text-lg text-brand-black">Nearby requests</h2>

                      <p className="text-xs text-brand-grey mt-0.5">

                        {!ridesEnabled

                          ? 'Pick & Drop is turned off'

                          : online

                            ? 'Sorted by distance from you'

                            : 'Go online to start receiving rides'}

                      </p>

                    </div>

                    <Badge tone={online ? 'green' : 'grey'}>{sortedAvailable.length}</Badge>

                  </div>

                </div>



                <div className="p-4 space-y-3 max-h-[520px] overflow-y-auto">

                  {!ridesEnabled && (

                    <div className="text-center py-10 px-4">

                      <div className="w-14 h-14 rounded-2xl bg-brand-muted mx-auto mb-3 flex items-center justify-center">

                        <Navigation className="w-7 h-7 text-brand-grey" />

                      </div>

                      <p className="font-bold text-brand-dark">Pick &amp; Drop is off</p>

                      <p className="text-sm text-brand-grey mt-1">Enable it under My services to receive ride requests.</p>

                    </div>

                  )}

                  {ridesEnabled && !online && (

                    <div className="text-center py-10 px-4">

                      <div className="w-14 h-14 rounded-2xl bg-brand-muted mx-auto mb-3 flex items-center justify-center">

                        <Power className="w-7 h-7 text-brand-grey" />

                      </div>

                      <p className="font-bold text-brand-dark">You&apos;re offline</p>

                      <p className="text-sm text-brand-grey mt-1">Toggle online below the map to see ride requests.</p>

                    </div>

                  )}

                  {ridesEnabled && online && sortedAvailable.length === 0 && (

                    <div className="text-center py-10 px-4">

                      <Spinner className="!w-7 !h-7 mx-auto mb-3" />

                      <p className="font-bold text-brand-dark">Waiting for requests</p>

                      <p className="text-sm text-brand-grey mt-1">New rides appear here in real time.</p>

                    </div>

                  )}

                  {ridesEnabled && online && sortedAvailable.map((r) => (

                    <RequestCard

                      key={r.bookingCode}

                      ride={r}

                      dist={r.dist}

                      busyCode={busyCode}

                      onAccept={accept}

                    />

                  ))}

                </div>

              </Card>

            )}

          </div>

        </div>

      </div>

    </PortalShell>

  );

}
