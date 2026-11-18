// ---------------------------------------------------------------------
// Tracking controller
//   - getTracking : GET /api/tracking/:bookingCode
//
// Drives the Grab-style tracking page (spec §7): current status, ETA text,
// assigned driver contact, and the full timeline. Keyed ONLY by the public
// booking code; internal UUIDs are never returned (spec §15).
// ---------------------------------------------------------------------
const trackingRepository = require('../repositories/trackingRepository');
const { travelEtaMinutes } = require('../lib/eta');
const { latestDriverFix } = require('../lib/tracking');

// Ride states where showing a live driver position makes sense.
const ACTIVE_RIDE_STATUSES = ['accepted', 'on_the_way', 'arrived', 'started'];

async function getTracking(req, res) {
  try {
    const { bookingCode } = req.params;

    // Fetch the booking (incl. internal ids we use server-side but never return).
    const booking = await trackingRepository.bookingByCode(bookingCode);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Timeline events, oldest first.
    const events = await trackingRepository.eventsForBooking(booking.id);

    // Assigned driver contact (safe fields only) + latest live position.
    let driver = null;
    let driverLocation = null;
    let liveEtaMinutes = null;
    if (booking.assigned_driver_id) {
      const d = await trackingRepository.driverContact(booking.assigned_driver_id);
      if (d) {
        driver = { name: d.full_name, whatsapp: d.whatsapp_number };
      }

      // Only surface a live dot while the ride is actually active, and only
      // if the fix is recent — latestDriverFix drops anything staler than
      // config.dispatch.driverFreshMinutes. A driver whose phone died used to
      // stay pinned on the map indefinitely, which reads as "he's parked
      // around the corner" and keeps the passenger waiting instead of calling.
      if (ACTIVE_RIDE_STATUSES.includes(booking.driver_ride_status)) {
        const fix = await latestDriverFix(booking.assigned_driver_id);
        if (fix) {
          driverLocation = fix;
          // Real driving time from Google, NOT floored: a ride has no kitchen
          // or packing stage in front of it, so the road leg is the whole
          // wait. Flooring it the way deliveries are would advertise 45
          // minutes for a 20-minute airport run.
          liveEtaMinutes = await travelEtaMinutes(fix, {
            lat: booking.pickup_lat,
            lng: booking.pickup_lng,
          });
        }
      }
    }

    return res.json({
      bookingCode: booking.booking_code,
      tripType: booking.trip_type,
      airportTerminal: booking.airport_terminal,
      pickupAddress: booking.pickup_address,
      pickupStreet: booking.pickup_street,
      pickupBuilding: booking.pickup_building,
      pickupLat: booking.pickup_lat,
      pickupLng: booking.pickup_lng,
      dropoffAddress: booking.dropoff_address,
      dropoffStreet: booking.dropoff_street,
      dropoffBuilding: booking.dropoff_building,
      dropoffLat: booking.dropoff_lat,
      dropoffLng: booking.dropoff_lng,
      pickupDatetime: booking.pickup_datetime,
      fareAmount: booking.fare_amount,
      currency: booking.currency,
      paymentMethod: booking.payment_method,
      paymentStatus: booking.payment_status,
      bookingStatus: booking.booking_status,
      verificationMode: booking.verification_mode,
      driverRideStatus: booking.driver_ride_status,
      // Contact number(s) shown + editable on the tracking page while active.
      passengerMobile: booking.passenger_mobile,
      passengerWhatsapp: booking.passenger_whatsapp,
      // ETAs are derived automatically from live data (no hand-filled columns):
      //   - scheduledPickup      : the booking's scheduled pickup time
      //   - paymentConfirmation  : when payment was confirmed (null until verified)
      //   - driverArrivalMinutes : live estimate from the driver's latest GPS to
      //                            the pickup point (null until a driver is active)
      etas: {
        scheduledPickup: booking.pickup_datetime,
        paymentConfirmation: booking.confirmed_at,
        driverArrivalMinutes: liveEtaMinutes,
      },
      driver,
      driverLocation,
      liveEtaMinutes,
      createdAt: booking.created_at,
      timeline: (events || []).map((e) => ({
        type: e.event_type,
        title: e.title,
        message: e.message,
        at: e.created_at,
      })),
    });
  } catch (err) {
    console.error('getTracking error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { getTracking };
