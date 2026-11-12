// ---------------------------------------------------------------------
// Driver controller (all routes gated by requireDriver; req.driverId set)
//   - listAvailableRides : GET  /api/driver/available   (Grab-style feed)
//   - acceptRide         : POST /api/driver/rides/:code/accept (atomic claim)
//   - updateDriverLocation: POST /api/driver/location     (live position)
//   - listMyRides        : GET  /api/driver/rides
//   - updateRideStatus   : POST /api/driver/rides/:code/status
//   - updateServiceTypes : PATCH /api/driver/services (verticals worked)
//
// A driver may only see/update rides assigned to them. Accepting a ride is
// first-come-first-served: the claim only succeeds while the booking is
// still unassigned. Completing a ride writes the ledger (spec §12).
// ---------------------------------------------------------------------
const database = require('../lib/database/pool');
const driverRepository = require('../repositories/driverRepository');
const { config } = require('../lib/config');
const { addTrackingEvent } = require('../lib/tracking');
const { createLedgerEntryForBooking } = require('../lib/ledger');
const { payableAmount, bookingVat } = require('../lib/fare');
const { round2, isBlockedFromCash, driverCashView, chargeDriverCashOwed } = require('../lib/driverCash');
const { haversineKm, etaMinutes } = require('../lib/geo');
const { assertWithinGeofence } = require('../lib/geofence');
const { logNotification } = require('../lib/notifications');
const { hasService } = require('../lib/serviceTypes');
const {
  pushBookingStatus,
  announceRequestTaken,
  pingAdmin,
  pushFoodOrderStatus,
  pushShopOrderStatus,
} = require('../lib/realtime');

// driver_ride_status value -> resulting booking_status + human title +
// the notification type recorded in the passenger's bell (spec section 5).
const STATUS_FLOW = {
  accepted:   { bookingStatus: 'driver_assigned',   title: 'Driver accepted',   message: 'Your driver accepted the trip.', notify: 'ride_driver_accepted' },
  on_the_way: { bookingStatus: 'driver_on_the_way', title: 'Driver on the way', message: 'Your driver is on the way to your pickup.', notify: 'ride_driver_on_the_way' },
  arrived:    { bookingStatus: 'arrived',           title: 'Driver arrived',    message: 'Your driver has arrived at the pickup point.', notify: 'ride_driver_arrived' },
  started:    { bookingStatus: 'in_progress',       title: 'Trip started',      message: 'Your trip has started.', notify: 'ride_trip_started' },
  completed:  { bookingStatus: 'completed',         title: 'Trip completed',    message: 'Your trip is complete. Thank you for riding with Alabiq.', notify: 'ride_completed' },
  cancelled:  { bookingStatus: 'cancelled',         title: 'Trip cancelled',    message: 'This trip was cancelled by the driver.', notify: 'ride_cancelled' },
};

// Ride states where the driver is actively heading to / carrying the rider.
// --- GET /api/driver/available ---------------------------------------
// Verified + confirmed + still unassigned bookings, nearest first.
async function listAvailableRides(req, res) {
  try {
    // Drivers who turned Pick & Drop off see an empty feed (200, not 403 —
    // the frontend polls this silently). Admin preview bypasses.
    if (req.role !== 'admin' && !hasService(req.profile, 'pick_drop')) {
      return res.json({ rides: [] });
    }

    const lat = req.query.lat != null ? Number(req.query.lat) : null;
    const lng = req.query.lng != null ? Number(req.query.lng) : null;
    const here = lat != null && lng != null ? { lat, lng } : null;

    const data = await driverRepository.availableRides();

    // A driver over their cash-owed cap can't accept cash rides, so don't
    // show them ones they'd only be blocked from taking (STC rides still show).
    let feed = data || [];
    if (req.role !== 'admin') {
      const drv = await driverRepository.cashProfile(req.driverId);
      if (drv && isBlockedFromCash(drv)) {
        feed = feed.filter((r) => r.payment_method !== 'cash');
      }
    }

    const rides = feed.map((r) => {
      const distanceKm = here
        ? haversineKm(here, { lat: r.pickup_lat, lng: r.pickup_lng })
        : null;
      return {
        ...r,
        distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
        etaMinutes: etaMinutes(distanceKm),
      };
    });

    // Nearest first when we know where the driver is; nulls go last.
    rides.sort((a, b) => {
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });

    return res.json({ rides });
  } catch (err) {
    console.error('listAvailableRides error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/driver/rides/:bookingCode/accept ----------------------
async function acceptRide(req, res) {
  try {
    if (req.role !== 'admin' && !hasService(req.profile, 'pick_drop')) {
      return res.status(403).json({ error: 'Enable Pick & Drop in your services to accept rides' });
    }

    const booking = await driverRepository.bookingByCode(req.params.bookingCode);
    if (!booking) return res.status(404).json({ error: 'Ride not found' });
    // Cash rides are ready on creation; STC Pay rides only once verified.
    if (booking.payment_status !== 'verified' && booking.payment_method !== 'cash') {
      return res.status(409).json({ error: 'Ride is not ready to be accepted yet' });
    }
    // Hard block: a driver who owes Alabiq at/over their cap cannot take
    // on more cash (they'd be holding even more of our money). STC rides are
    // unaffected — no cash changes hands.
    if (booking.payment_method === 'cash') {
      const drv = await driverRepository.cashProfile(req.driverId);
      if (drv && isBlockedFromCash(drv)) {
        return res.status(403).json({
          error: 'Settle your outstanding cash with Alabiq before taking new cash rides',
          failure_reason: 'cash_owed_limit_reached',
          cash: driverCashView(drv),
        });
      }
    }
    if (booking.assigned_driver_id) {
      return res.status(409).json({ error: 'Ride already taken' });
    }

    // Atomic claim: only succeeds while assigned_driver_id is STILL null, so
    // two drivers tapping "accept" at once can never both win.
    const claimed = await driverRepository.claimRide(booking.id, req.driverId);
    if (!claimed) {
      return res.status(409).json({ error: 'Ride already taken' });
    }

    // Driver contact for the passenger's tracking screen.
    const driver = await driverRepository.profileContact(req.driverId);

    await addTrackingEvent(booking.id, {
      eventType: 'driver_accepted',
      title: 'Driver accepted',
      message: `${(driver && driver.full_name) || 'A driver'} accepted your trip and is on the way.`,
      createdByUserId: req.driverId,
    });

    const driverPayload = driver
      ? { name: driver.full_name, whatsapp: driver.whatsapp_number }
      : null;
    pushBookingStatus(booking.booking_code, {
      bookingStatus: 'driver_assigned',
      driverRideStatus: 'accepted',
      driver: driverPayload,
    });
    announceRequestTaken(booking.booking_code);
    logNotification({
      userId: booking.user_id,
      bookingId: booking.id,
      type: 'ride_driver_accepted',
      code: booking.booking_code,
    });

    return res.json({
      bookingCode: claimed.booking_code,
      bookingStatus: claimed.booking_status,
      driverRideStatus: claimed.driver_ride_status,
      driver: driverPayload,
    });
  } catch (err) {
    console.error('acceptRide error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/driver/location ---------------------------------------
// Driver app posts GPS periodically. We store it and push it live to the
// passenger(s) whose active ride this driver is currently handling.
//
// The app pings every ~4s so the customer's marker has enough fixes to glide
// continuously instead of teleporting once every 12s. Accepting that rate does
// NOT mean doing 3x the work: the two expensive effects are throttled
// independently below, keeping row growth and Realtime message volume at
// roughly the old 12s cadence while the map still feels live.
//
// State is a module-level Map, i.e. per-process. That is correct on the
// long-running VPS (one process — the same assumption lib/dispatch.js's
// sweeper already makes). On serverless each instance would keep its own
// clock and throttle less aggressively; it degrades toward "write/broadcast
// every ping", never toward dropping a ride's updates.
const lastPing = new Map(); // driverId -> { wroteAt, sentAt, lat, lng }

// Persist at most one row per this interval. driver_locations is write-heavy
// and retained 30 days (0016/0028), so 4s pings unthrottled would be ~900
// rows/hour/driver against a Free-tier budget.
const WRITE_EVERY_MS = 10000;
// Broadcast at most this often. Supabase Free allows a finite number of
// Realtime messages per month and every ping fans out to each active job.
const BROADCAST_EVERY_MS = 8000;
// ...unless the driver has covered an unusual amount of ground since the last
// push, in which case send early so the marker doesn't visibly cut a corner
// by interpolating a straight line across a long, curved gap.
//
// This is an EXCEPTION, and the threshold has to be picked against the real
// per-ping distances or it stops being one. Measured with 4s pings:
//
//     city      30 km/h  ->  ~37m per ping
//     road      60 km/h  ->  ~75m per ping
//     motorway 120 km/h  -> ~147m per ping
//
// A first attempt at 60m fired on every ping from 30 km/h upward — the time
// throttle never applied and Realtime ran at one message per ping, near the
// Free-tier ceiling. 150m overcorrected: it sat just above the motorway
// figure, so it never fired at any realistic speed and was dead code.
//
// 120m sits in the gap. City and normal road speeds fall well under it and
// are governed by the 8s window; motorway speed clears it and updates every
// ping. That is the right bias for an airport-transfer service — the fast
// leg is where a stale position is most visibly wrong, and it is also where
// the marker would otherwise interpolate ~290m in a straight line.
const BROADCAST_IF_MOVED_KM = 0.12;

// Keep the Map from growing without bound as drivers come and go across a
// long-lived process. Entries older than an hour cannot affect a throttle
// decision, so dropping them is free.
function pruneLastPing(now) {
  if (lastPing.size < 500) return;
  for (const [id, v] of lastPing) {
    if (now - Math.max(v.wroteAt || 0, v.sentAt || 0) > 3600000) lastPing.delete(id);
  }
}

async function updateDriverLocation(req, res) {
  try {
    const { lat, lng, accuracy, heading, speed_kmh: speedKmh } = req.body || {};
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const here = { lat: Number(lat), lng: Number(lng) };
    const now = Date.now();
    const prev = lastPing.get(req.driverId) || {};
    pruneLastPing(now);

    // --- 1. Persist (throttled) ---
    if (!prev.wroteAt || now - prev.wroteAt >= WRITE_EVERY_MS) {
      await database.query(`INSERT INTO public.driver_locations
        (driver_id,lat,lng,accuracy_meters,heading,speed_kmh) VALUES ($1,$2,$3,$4,$5,$6)`, [
        req.driverId, here.lat, here.lng, accuracy != null ? Number(accuracy) : null,
        // Device compass/speedometer (migration 0033). Null is normal —
        // stationary or unsupported — and readers fall back to a derived
        // bearing rather than treating it as an error.
        heading != null ? Number(heading) : null,
        speedKmh != null ? Number(speedKmh) : null,
      ]);
      lastPing.set(req.driverId, { ...prev, wroteAt: now });
    }

    // --- 2. Fan out to live maps (throttled, distance-aware) ---
    const movedKm = prev.lat != null ? haversineKm(prev, here) : null;
    const shouldBroadcast =
      !prev.sentAt ||
      now - prev.sentAt >= BROADCAST_EVERY_MS ||
      (movedKm != null && movedKm >= BROADCAST_IF_MOVED_KM);
    if (!shouldBroadcast) return res.json({ ok: true });
    lastPing.set(req.driverId, { ...(lastPing.get(req.driverId) || prev), sentAt: now, lat: here.lat, lng: here.lng });

    // The position payload every vertical sends. heading rides along so the
    // customer's car icon can point the right way on the FIRST frame after a
    // page reload, instead of starting due north and waiting for two fixes.
    const at = new Date().toISOString();
    const fix = {
      ...here,
      at,
      heading: heading != null ? Number(heading) : null,
      speedKmh: speedKmh != null ? Number(speedKmh) : null,
    };

    // Push live position to any active ride this driver is on.
    const activeRides = await driverRepository.activeRides(req.driverId);

    (activeRides || []).forEach((r) => {
      const distanceKm = haversineKm(here, { lat: r.pickup_lat, lng: r.pickup_lng });
      pushBookingStatus(r.booking_code, {
        driverLocation: fix,
        etaMinutes: etaMinutes(distanceKm),
      });
    });

    // Same for any food delivery this driver is carrying — the customer's
    // tracking map moves the rider pin on every ping (Grab-style).
    const activeDeliveries = await driverRepository.activeDeliveries('food', req.driverId, ['accepted','preparing','ready','out_for_delivery']);

    (activeDeliveries || []).forEach((o) => {
      const distanceKm = haversineKm(here, { lat: o.delivery_lat, lng: o.delivery_lng });
      pushFoodOrderStatus(o.order_code, {
        status: o.status,
        riderLocation: fix,
        riderEtaMinutes: etaMinutes(distanceKm),
      });
    });

    // ...and any shop delivery. This branch did not exist: a rider could be
    // carrying an ecommerce order and the customer's map had no pin to move,
    // which is why shop tracking looked permanently frozen.
    const shopDeliveries = await driverRepository.activeDeliveries('shop', req.driverId, ['accepted','packing','ready','out_for_delivery']);

    (shopDeliveries || []).forEach((o) => {
      const distanceKm = haversineKm(here, { lat: o.delivery_lat, lng: o.delivery_lng });
      pushShopOrderStatus(o.order_code, {
        status: o.status,
        riderLocation: fix,
        riderEtaMinutes: etaMinutes(distanceKm),
      });
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('updateDriverLocation error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/driver/rides -------------------------------------------
async function listMyRides(req, res) {
  try {
    return res.json({ rides: await driverRepository.listRides(req.driverId, req.query.driver_ride_status) });
  } catch (err) {
    console.error('listMyRides error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/driver/rides/:bookingCode/status ----------------------
async function updateRideStatus(req, res) {
  try {
    const status = req.body && req.body.status;
    if (!status || !STATUS_FLOW[status]) {
      return res.status(400).json({
        error: `status is required and must be one of: ${Object.keys(STATUS_FLOW).join(', ')}`,
      });
    }

    const booking = await driverRepository.bookingByCode(req.params.bookingCode);
    if (!booking) return res.status(404).json({ error: 'Ride not found' });
    if (booking.assigned_driver_id !== req.driverId) {
      return res.status(403).json({ error: 'This ride is not assigned to you' });
    }
    if (booking.driver_ride_status === 'completed') {
      return res.status(409).json({ error: 'Ride already completed' });
    }

    // "Arrived" was previously a fully trusted, unchecked client claim — a
    // driver could tap it from anywhere. Airport pickups get a larger radius:
    // the pickup point there is a whole terminal building, not a precise curb.
    if (status === 'arrived') {
      const radiusMeters = booking.trip_type === 'airport_to_house'
        ? config.geofence.airportRadiusMeters
        : config.geofence.defaultRadiusMeters;
      const geofenceError = await assertWithinGeofence({
        driverId: req.driverId,
        target: { lat: booking.pickup_lat, lng: booking.pickup_lng },
        radiusMeters,
        bodyLat: Number(req.body && req.body.lat),
        bodyLng: Number(req.body && req.body.lng),
      });
      if (geofenceError) return res.status(geofenceError.httpStatus).json(geofenceError.body);
    }

    const flow = STATUS_FLOW[status];
    const updated = await driverRepository.updateRideStatus({
      booking, driverId: req.driverId, status, bookingStatus: flow.bookingStatus,
    });
    if (!updated) return res.status(409).json({ error: 'Ride status changed — please refresh' });

    await addTrackingEvent(booking.id, {
      eventType: `driver_${status}`,
      title: flow.title,
      message: flow.message,
      createdByUserId: req.driverId,
    });

    // Increment 6: completing the ride creates the ledger / payout entry.
    let ledger = null;
    if (status === 'completed') {
      const result = await createLedgerEntryForBooking({ booking, driverId: req.driverId });
      if (result.error) {
        console.error('ledger creation error:', result.error);
        return res.status(500).json({ error: 'Ride completed but ledger creation failed' });
      }
      ledger = {
        driverNet: result.ledger.driver_net,
        platformNet: result.ledger.platform_net,
        payoutStatus: result.ledger.payout_status,
      };

      // Cash rides settle at handover: the driver has now collected the
      // fare, so mark the booking paid and log the collection. Best-effort
      // — a failure here must not fail the (already applied) completion.
      // The ledger still models "platform holds fare, owes driver"; for cash
      // the driver is holding it, so we ALSO record the commission they now
      // owe Alabiq (driver cash settlement, migration 0022).
      if (booking.payment_method === 'cash' && booking.payment_status !== 'verified') {
        try {
          await database.query("UPDATE public.bookings SET payment_status='verified' WHERE id=$1", [booking.id]);
          await database.query(`INSERT INTO public.payments
            (booking_id,provider,amount,currency,status,verified_by_system,verified_at,notes)
            VALUES ($1,'cash',$2,$3,'verified',true,now(),'Cash collected by driver at completion')`, [booking.id,
          // The passenger hands over fare + VAT.
          payableAmount(booking), booking.currency]);
        } catch (payErr) { console.error('cash payment record error:', payErr); }

        // Charge the platform commission to the driver's cash-owed balance,
        // PLUS the VAT they collected — that is Alabiq's liability to
        // the tax authority, so it has to come back off the driver rather
        // than stay in their pocket (migration 0025).
        // Only on a freshly-written ledger row (the completed-guard above
        // already prevents re-entry, and result.skipped is a second belt).
        //
        // The distance surcharge (0034) has to come back too. It sits
        // OUTSIDE fare_amount because it is platform revenue, not driver
        // earnings -- but it is inside total_amount, so the passenger hands
        // it to the driver in cash. Omitting it here let the driver keep it:
        // on a 40 km ride that is SAR 6.25 a trip, scaling with distance.
        if (!result.skipped) {
          await chargeDriverCashOwed({
            driverId: req.driverId,
            bookingId: booking.id,
            amount: round2(
              result.ledger.platform_net +
                bookingVat(booking) +
                Number(booking.distance_surcharge || 0)
            ),
          });
        }
      }
    }

    pushBookingStatus(updated.booking_code, {
      bookingStatus: updated.booking_status,
      driverRideStatus: updated.driver_ride_status,
    });
    pingAdmin(updated.booking_code);

    // Ring the passenger's bell for this lifecycle step (spec section 5).
    if (flow.notify) {
      logNotification({
        userId: booking.user_id,
        bookingId: booking.id,
        type: flow.notify,
        code: booking.booking_code,
      });
    }
    // A warm Thank You once the trip is done.
    if (status === 'completed') {
      logNotification({
        userId: booking.user_id,
        bookingId: booking.id,
        type: 'ride_thank_you',
        code: booking.booking_code,
      });
    }

    return res.json({
      bookingCode: updated.booking_code,
      driverRideStatus: updated.driver_ride_status,
      bookingStatus: updated.booking_status,
      ledger,
    });
  } catch (err) {
    console.error('updateRideStatus error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/driver/cash ---------------------------------------------
// What this driver currently owes Alabiq from cash pick & drop rides,
// whether they're blocked from new cash rides, and their recent movements.
async function getMyCash(req, res) {
  try {
    const [drv, ledger] = await Promise.all([
      driverRepository.cashProfile(req.driverId), driverRepository.cashLedger(req.driverId),
    ]);
    if (!drv) return res.status(404).json({ error: 'Driver not found' });

    return res.json({ ...driverCashView(drv), ledger });
  } catch (err) {
    console.error('getMyCash error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- PATCH /api/driver/services ---------------------------------------
// Save which verticals this driver works (route validates: array of
// known values). Body already cleaned by validateBody; dedupe and reject
// empty here (belt-and-braces with the 0020 CHECK constraint).
async function updateServiceTypes(req, res) {
  try {
    const cleaned = [...new Set(req.body.service_types)];
    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'Select at least one service type' });
    }

    const data = await driverRepository.setServiceTypes(req.driverId, cleaned);
    if (!data) return res.status(404).json({ error: 'Driver not found' });

    return res.json({ serviceTypes: data.service_types });
  } catch (err) {
    console.error('updateServiceTypes error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = {
  listAvailableRides,
  acceptRide,
  updateDriverLocation,
  listMyRides,
  updateRideStatus,
  getMyCash,
  updateServiceTypes,
};
