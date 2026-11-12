// ---------------------------------------------------------------------
// Passenger: Grab-style live tracking.
//   - live driver position on the map + ETA
//   - pickup & drop-off pins
//   - WhatsApp the driver
//   - cancel booking
//   - status timeline
// Updates via the API event stream, with an 8s polling safety net.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MessageCircle, X, MapPin, Flag, Navigation, Clock, RefreshCw, Car, Heart, Download, Banknote } from 'lucide-react';
import { api } from '../lib/api';
import useReturnedCharge from '../lib/useReturnedCharge';
import { formatAddressDetail } from '../lib/address';
import { downloadRideInvoice } from '../lib/invoice';
import { useBroadcast } from '../lib/useBroadcast';
import { realtimeEnabled } from '../lib/gatewayClient';
import { statusMeta, whatsappLink, CANCELLABLE } from '../lib/constants';
import { fetchRoute } from '../lib/osrm';
import { movementFrom, bearingDeg, resolveCoordsFromAddress } from '../lib/geo';
import { notifyAlert } from '../lib/notify';
import { useAuth } from '../lib/AuthProvider';
import { PortalShell, Card, Badge, Spinner, btnGhost } from '../components/ui';
import RideMap from '../components/RideMap';
import RateDriver from '../components/RateDriver';
import EditableContact from '../components/EditableContact';

// Round a coord to ~100m so the OSRM route only refetches on real movement.
const r3 = (x) => (x == null ? '' : Math.round(x * 1000) / 1000);

// Mini car glyph for the map legend's Driver chip (matches the map marker).
const LEGEND_CAR_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-5.4A2 2 0 0 0 13.5 3h-3A2 2 0 0 0 8.7 4.6L6 10l-2.5 1.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2"/>' +
  '<circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>';

const ACTIVE = ['accepted', 'on_the_way', 'arrived', 'started'];

export default function TrackPage() {
  const { code } = useParams();
  const { session, profile, user } = useAuth(); // rating requires a signed-in owner
  const [data, setData] = useState(null);
  const [live, setLive] = useState({ driverLocation: null, etaMinutes: null });
  const [route, setRoute] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [movement, setMovement] = useState({ speedKmh: null, moving: false, heading: null });
  const prevDriverRef = useRef(null);
  const prevStatusRef = useRef(null);
  const doneRef = useRef(false);

  const refetch = useCallback(async () => {
    try {
      const d = await api.tracking(code);
      setData(d);
      doneRef.current = d.bookingStatus === 'completed' || d.bookingStatus === 'cancelled';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [code]);

  // Back from Tap's hosted page: confirm the charge directly rather than
  // waiting on a webhook that may never arrive. No-op on every other visit.
  useReturnedCharge(refetch);

  useEffect(() => { refetch(); }, [refetch]);

  // Realtime: live position + status changes.
  const connected = useBroadcast(
    `booking-${code}`,
    {
      status: (payload) => {
        if (payload.driverLocation) setLive((l) => ({ ...l, driverLocation: payload.driverLocation }));
        if (payload.etaMinutes != null) setLive((l) => ({ ...l, etaMinutes: payload.etaMinutes }));
        if (payload.bookingStatus || payload.paymentStatus || payload.driver) refetch();
      },
    },
    realtimeEnabled
  );

  // Polling safety net for when realtime isn't configured or the socket drops.
  // Skipped while the broadcast channel is live — it already delivers every
  // position and status change, so polling on top was a redundant request
  // every 8s per open tracking page. Matches FoodTrackPage/ShopTrackPage.
  useEffect(() => {
    if (connected) return undefined;
    const id = setInterval(() => { if (!doneRef.current) refetch(); }, 8000);
    return () => clearInterval(id);
  }, [refetch, connected]);

  // Real road route (OSRM) for the current leg: driver→pickup while the driver
  // is on the way, otherwise pickup→dropoff (shown immediately, even before a
  // driver is assigned, so the passenger sees their route — not just pins).
  // Falls back silently to a straight line when OSRM is unreachable.
  const driverPoint = live.driverLocation || data?.driverLocation || null;
  const routeSig = data
    ? [
        r3(data.pickupLat), r3(data.pickupLng), r3(data.dropoffLat), r3(data.dropoffLng),
        data.driverRideStatus, r3(driverPoint?.lat), r3(driverPoint?.lng),
      ].join(',')
    : '';

  useEffect(() => {
    if (!data) return undefined;
    const pickup = resolveCoordsFromAddress(data.pickupAddress, data.pickupLat, data.pickupLng);
    const dropoff = resolveCoordsFromAddress(data.dropoffAddress, data.dropoffLat, data.dropoffLng);
    const driverLoc = live.driverLocation || data.driverLocation;
    const tripStarted = data.driverRideStatus === 'started';

    let from = null;
    let to = null;
    if (driverLoc && pickup && !tripStarted) { from = driverLoc; to = pickup; }
    else if (pickup && dropoff) { from = pickup; to = dropoff; }

    if (!from || !to) { setRoute(null); return undefined; }

    let cancelled = false;
    fetchRoute(from, to).then((r) => { if (!cancelled) setRoute(r); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSig]);

  // Speed + heading for the live badge and the car's facing direction.
  //
  // The driver's device now sends its own compass/speedometer reading, so use
  // that when present and only fall back to deriving from two fixes. The
  // derived value lags by a full ping, jitters when GPS wanders at a red
  // light, and — because it needs two fixes — left the car pointing due north
  // for the first several seconds after every page load.
  useEffect(() => {
    const cur = live.driverLocation || data?.driverLocation;
    if (!cur || cur.lat == null) return;
    const prev = prevDriverRef.current;
    if (prev && (prev.lat !== cur.lat || prev.lng !== cur.lng)) {
      const dt = cur.at && prev.at ? (new Date(cur.at) - new Date(prev.at)) / 1000 : null;
      setMovement({ ...movementFrom(prev, cur, dt), heading: bearingDeg(prev, cur) });
    }
    prevDriverRef.current = { lat: cur.lat, lng: cur.lng, at: cur.at };
  }, [live.driverLocation, data?.driverLocation]);

  // Ring the bell + toast when the driver's status changes (arrived, on the
  // way to drop-off, etc.). Skips the first load so we only alert on real
  // transitions while the passenger is watching.
  useEffect(() => {
    const s = data?.driverRideStatus;
    if (!s) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = s;
    if (prev == null || prev === s) return;
    const msgs = {
      accepted: { t: 'A driver accepted your trip', icon: 'success' },
      on_the_way: { t: 'Your driver is on the way to you', icon: 'info' },
      arrived: { t: 'Your driver has arrived', icon: 'success' },
      started: { t: "You're on the way to your destination", icon: 'info' },
      completed: { t: 'Trip completed — thank you for riding', icon: 'success' },
    };
    if (msgs[s]) notifyAlert(msgs[s].t, { icon: msgs[s].icon });
  }, [data?.driverRideStatus]);

  async function onCancel() {
    if (!window.confirm('Cancel this booking? This cannot be undone.')) return;
    setCancelling(true);
    try {
      await api.cancelBooking(code, 'Cancelled by passenger');
      await refetch();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <PortalShell title="Tracking" subtitle={code}>
        <div className="flex items-center justify-center py-20"><Spinner className="!w-8 !h-8" /></div>
      </PortalShell>
    );
  }
  if (error && !data) {
    return (
      <PortalShell title="Tracking" subtitle={code}>
        <Card className="p-6 text-center">
          <p className="text-red-600 font-bold mb-3">{error}</p>
          <Link to="/book" className={btnGhost}>Make a new booking</Link>
        </Card>
      </PortalShell>
    );
  }

  const meta = statusMeta(data.bookingStatus);
  const driverLoc = live.driverLocation || data.driverLocation;
  // Prefer the heading the driver's device reported over one derived from two
  // fixes: it is available on the very first frame (so the car doesn't sit
  // pointing due north right after a page load), doesn't lag a ping behind,
  // and doesn't jitter when GPS wanders while the car is stopped at a light.
  const driverHeading = driverLoc?.heading ?? movement.heading;
  const driverSpeedKmh = driverLoc?.speedKmh ?? movement.speedKmh;
  // Live driver ETA wins; otherwise fall back to the OSRM route's trip time.
  const eta = live.etaMinutes ?? data.liveEtaMinutes ?? route?.durationMin ?? null;
  const isActive = ACTIVE.includes(data.driverRideStatus);
  const waiting = data.bookingStatus === 'confirmed' || data.bookingStatus === 'payment_under_review';
  const tripStarted = data.driverRideStatus === 'started';

  const pickup = resolveCoordsFromAddress(data.pickupAddress, data.pickupLat, data.pickupLng);
  const dropoff = resolveCoordsFromAddress(data.dropoffAddress, data.dropoffLat, data.dropoffLng);

  const markers = [
    pickup && { ...pickup, type: 'pickup', label: 'Pickup', key: 'p' },
    dropoff && { ...dropoff, type: 'dropoff', label: 'Drop-off', key: 'd' },
    driverLoc && { lat: driverLoc.lat, lng: driverLoc.lng, type: 'driver', label: 'Your driver', key: 'driver', heading: driverHeading },
  ].filter(Boolean);

  const mapLegend = [
    pickup && { glyph: 'P', color: '#FF7E21', label: 'Pickup' },
    dropoff && { glyph: 'D', color: '#1F2937', label: 'Drop-off' },
    driverLoc && { svg: LEGEND_CAR_SVG, color: '#FF7E21', label: 'Driver' },
  ].filter(Boolean);

  // Prefer the real OSRM road geometry; fall back to a straight guide line
  // (driver→pickup before the trip, otherwise pickup→dropoff) when unavailable.
  let straight = null;
  if (driverLoc && pickup && !tripStarted) straight = [driverLoc, pickup];
  else if (pickup && dropoff) straight = [pickup, dropoff];
  const line = route?.coords && route.coords.length >= 2 ? route.coords : straight;

  const canCancel = CANCELLABLE.includes(data.bookingStatus);
  const waLink = data.driver && whatsappLink(data.driver.whatsapp, `Hi, this is about booking ${code}`);

  return (
    <PortalShell
      title="Live tracking"
      subtitle={code}
      right={
        <button onClick={refetch} className="p-2 rounded-lg hover:bg-brand-surface cursor-pointer" title="Refresh">
          <RefreshCw className="w-4 h-4 text-brand-grey" />
        </button>
      }
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {waiting && <Spinner />}
          <div>
            <div className="font-black text-lg text-brand-black leading-tight">{meta.label}</div>
            <div className="text-xs text-brand-grey">
              {waiting ? 'Hang tight — matching you with a nearby driver…' : `Driver status: ${data.driverRideStatus || '—'}`}
            </div>
          </div>
        </div>
        <Badge tone={meta.tone}>{data.bookingStatus}</Badge>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 p-2 relative overflow-hidden">
          <RideMap
            markers={markers}
            line={line}
            legend={mapLegend}
            height={380}
            follow={isActive && !!driverLoc}
            followTarget={tripStarted ? dropoff : pickup}
          />
          {eta != null && line && (
            <div className="absolute top-4 left-4 z-[400] bg-white rounded-xl shadow-lg border border-brand-border px-4 py-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-orange" />
              <div>
                <div className="text-[10px] font-bold text-brand-grey uppercase leading-none">
                  {isActive ? 'ETA' : 'Est. trip'}
                </div>
                <div className="font-black text-brand-black leading-tight">{eta} min</div>
                {isActive && driverLoc && (
                  driverSpeedKmh != null && (movement.moving || driverSpeedKmh >= 3) ? (
                    <div className="text-[10px] font-bold text-green-600 leading-none mt-0.5">
                      Moving · ~{Math.round(driverSpeedKmh)} km/h
                    </div>
                  ) : (
                    <div className="text-[10px] font-bold text-brand-grey leading-none mt-0.5">Stopped</div>
                  )
                )}
              </div>
            </div>
          )}
          {!realtimeEnabled && (
            <div className="absolute bottom-3 left-3 z-[400] text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded">
              Realtime off — refreshing every 8s
            </div>
          )}
          {realtimeEnabled && connected && (
            <div className="absolute bottom-3 left-3 z-[400] text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {data.driver ? (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-brand-orange/10 flex items-center justify-center text-brand-orange">
                  <Car className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="font-black text-brand-black truncate">{data.driver.name || 'Your driver'}</div>
                  <div className="text-xs text-brand-grey">Alabiq driver</div>
                </div>
              </div>
              {waLink && (
                <a href={waLink} target="_blank" rel="noreferrer"
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                  <MessageCircle className="w-4 h-4" /> Message driver on WhatsApp
                </a>
              )}
            </Card>
          ) : (
            <Card className="p-4 text-center text-sm text-brand-grey">
              {waiting ? 'No driver yet — waiting for one to accept your trip.' : '—'}
            </Card>
          )}

          {/* Cash trip reminder — until the fare is collected at pickup. */}
          {data.paymentMethod === 'cash' && data.bookingStatus !== 'completed' && (
            <Card className="p-4 flex items-center gap-3 bg-brand-warm border-brand-orange/30">
              <span className="w-10 h-10 rounded-xl bg-brand-orange text-white flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-brand-dark text-sm">Cash trip</p>
                <p className="text-xs text-brand-grey">
                  Pay SAR {Number(data.fareAmount).toFixed(2)} to your driver in cash at pickup.
                </p>
              </div>
            </Card>
          )}

          {/* Trip completed: warm thank-you + downloadable PDF invoice (spec §6). */}
          {data.bookingStatus === 'completed' && (
            <Card className="p-5 text-center bg-gradient-to-br from-brand-orange/10 to-white border-brand-orange/30">
              <div className="w-12 h-12 rounded-full bg-brand-orange/15 text-brand-orange flex items-center justify-center mx-auto mb-2">
                <Heart className="w-6 h-6" />
              </div>
              <p className="font-black text-brand-black">Thank you for riding with Alabiq!</p>
              <p className="text-xs text-brand-grey mt-1 mb-4">
                We hope you had a great trip. Your invoice is ready to download.
              </p>
              <button
                type="button"
                onClick={() =>
                  downloadRideInvoice({
                    booking: {
                      booking_code: data.bookingCode || code,
                      trip_type: data.tripType,
                      pickup_address: data.pickupAddress,
                      pickup_street: data.pickupStreet,
                      pickup_building: data.pickupBuilding,
                      dropoff_address: data.dropoffAddress,
                      dropoff_street: data.dropoffStreet,
                      dropoff_building: data.dropoffBuilding,
                      pickup_datetime: data.pickupDatetime,
                      created_at: data.createdAt,
                      fare_amount: data.fareAmount,
                      currency: data.currency,
                      payment_status: data.paymentStatus,
                      payment_method: data.paymentMethod === 'cash' ? 'Cash' : 'STC Pay',
                      passenger_mobile: data.passengerMobile || data.passengerWhatsapp,
                    },
                    customerName: profile?.fullName || user?.email || 'Alabiq customer',
                    driverName: data.driver?.name,
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-black py-3 rounded-xl transition-all shadow-lg shadow-brand-orange/20 text-sm cursor-pointer"
              >
                <Download className="w-4 h-4" /> Download invoice (PDF)
              </button>
            </Card>
          )}

          {/* Trip finished: rate the driver (1-5 stars). Owner accounts only —
              guest bookings have no account to rate from. */}
          {data.bookingStatus === 'completed' && data.driver && session && (
            <RateDriver kind="ride" code={code} driverName={data.driver.name} />
          )}

          <Card className="p-4 space-y-3">
            <div className="flex gap-3">
              <MapPin className="w-5 h-5 text-brand-orange shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-brand-grey uppercase">Pickup</div>
                <div className="text-sm font-medium text-brand-dark">
                  {formatAddressDetail({
                    street: data.pickupStreet,
                    building: data.pickupBuilding,
                    address: data.pickupAddress,
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Flag className="w-5 h-5 text-brand-black shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-brand-grey uppercase">Drop-off</div>
                <div className="text-sm font-medium text-brand-dark">
                  {formatAddressDetail({
                    street: data.dropoffStreet,
                    building: data.dropoffBuilding,
                    address: data.dropoffAddress,
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-between pt-2 border-t border-brand-border text-sm">
              <span className="text-brand-grey">Fare</span>
              <span className="font-black text-brand-orange">SAR {data.fareAmount}</span>
            </div>
          </Card>

          {/* Contact number — the owner may edit it even mid-trip so the
              driver/admin always reach the right number. */}
          <EditableContact
            value={data.passengerMobile || data.passengerWhatsapp}
            editable={!!session && !['completed', 'cancelled'].includes(data.bookingStatus)}
            onSave={async (phone) => {
              await api.updateBookingContact(code, { passenger_mobile: phone });
              await refetch();
            }}
          />

          {canCancel && (
            <button onClick={onCancel} disabled={cancelling}
              className="w-full inline-flex items-center justify-center gap-2 bg-white hover:bg-red-50 text-red-600 font-bold py-3 rounded-xl border border-red-200 transition-colors cursor-pointer disabled:opacity-50">
              {cancelling ? <Spinner /> : <><X className="w-4 h-4" /> Cancel booking</>}
            </button>
          )}
        </div>
      </div>

      <Card className="p-5 mt-4">
        <div className="flex items-center gap-2 font-black text-brand-black mb-4">
          <Navigation className="w-4 h-4 text-brand-orange" /> Trip timeline
        </div>
        <ol className="space-y-4">
          {(data.timeline || []).map((e, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`w-3 h-3 rounded-full ${i === data.timeline.length - 1 ? 'bg-brand-orange' : 'bg-brand-border'}`} />
                {i < data.timeline.length - 1 && <span className="w-px flex-1 bg-brand-border mt-1" />}
              </div>
              <div className="pb-1 -mt-1">
                <div className="text-sm font-bold text-brand-dark">{e.title || e.type}</div>
                {e.message && <div className="text-xs text-brand-grey">{e.message}</div>}
                <div className="text-[10px] text-brand-grey mt-0.5">{new Date(e.at).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </PortalShell>
  );
}
