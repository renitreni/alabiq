// ---------------------------------------------------------------------
// Bookings controller
//   - createBooking: POST /api/bookings
//   - getBookingByCode: GET /api/bookings/:bookingCode
//
// The database fills in booking_code, payment_status, booking_status, etc.
// via its column defaults (see the SQL schema), so we only send the data
// that comes from the booking form.
// ---------------------------------------------------------------------
const bookingsRepository = require('../repositories/bookingsRepository');
const { quoteFare } = require('../lib/fare');
const { haversineKm } = require('../lib/geo');
const { exceedsMaxRadius } = require('../lib/deliveryPricing');
const { getMaxDistanceKm } = require('../lib/settings');
const { tapConfigured } = require('../lib/tap');
const { addTrackingEvent } = require('../lib/tracking');
const { pushBookingStatus, announceRequestTaken } = require('../lib/realtime');
const { logNotification, notifyAdmins } = require('../lib/notifications');

// Booking states from which a passenger may still cancel (not once the trip
// is underway or already finished).
const CANCELLABLE_STATUSES = [
  'pending_payment',
  'payment_under_review',
  'confirmed',
  'driver_assigned',
  'driver_on_the_way',
  'arrived',
];

async function createBooking(req, res) {
  try {
    const b = req.body || {};

    // --- minimal validation (spec section 5 fields) ---
    const errors = [];
    if (!['house_to_airport', 'airport_to_house'].includes(b.trip_type)) {
      errors.push('trip_type must be "house_to_airport" or "airport_to_house"');
    }
    if (!b.pickup_address) errors.push('pickup_address is required');
    if (!b.dropoff_address) errors.push('dropoff_address is required');
    if (!b.pickup_datetime) errors.push('pickup_datetime is required (ISO timestamp)');
    if (!b.passenger_name) errors.push('passenger_name is required');
    if (!b.passenger_whatsapp) errors.push('passenger_whatsapp is required');
    if (b.pickup_datetime && Number.isNaN(Date.parse(b.pickup_datetime))) {
      errors.push('pickup_datetime must be a valid ISO timestamp');
    }
    const numOrNull = (v) => v == null || (typeof v === 'number' && Number.isFinite(v));
    if (![b.pickup_lat, b.pickup_lng, b.dropoff_lat, b.dropoff_lng].every(numOrNull)) {
      errors.push('coordinates must be numbers');
    }
    // This route has no validateBody schema, so the optional address details
    // are capped here — same limits the food/shop/merchant schemas use. They
    // reach the driver card and the PDF invoice, so an uncapped string would
    // land straight in both.
    for (const [field, max] of [
      ['pickup_street', 200], ['pickup_building', 100],
      ['dropoff_street', 200], ['dropoff_building', 100],
    ]) {
      const v = b[field];
      if (v != null && (typeof v !== 'string' || v.length > max)) {
        errors.push(`${field} must be a string of at most ${max} characters`);
      }
    }
    const paymentMethod = b.payment_method ?? 'stcpay_manual';
    if (!['stcpay_manual', 'cash', 'tap'].includes(paymentMethod)) {
      errors.push('payment_method must be "stcpay_manual", "cash" or "tap"');
    }
    // Card at order creation used to be refused outright, because an order
    // must never be created against a gateway that might be unconfigured.
    // That invariant still holds - it is just checked explicitly now, rather
    // than by refusing the method for everyone. The picker only offers card
    // when GET /api/payments/config says it is live, so reaching this is
    // either a stale client or a key that was rotated out mid-session.
    if (paymentMethod === 'tap' && !tapConfigured()) {
      errors.push('Card payment is not available right now');
    }
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    const isCash = paymentMethod === 'cash';

    // --- fare snapshot (computed once, never recalculated) ---
    // `amount` is the EX-VAT fare and stays the driver-commission base
    // (lib/ledger.js); VAT and the distance surcharge ride alongside it and
    // totalAmount is what the passenger actually pays. See migrations 0025
    // and 0034.
    //
    // Distance is straight-line pickup -> dropoff. Both ends are nullable,
    // and haversineKm returns null if either is missing — which quoteFare
    // reads as "no surcharge" rather than guessing.
    const distanceKm = haversineKm(
      { lat: b.pickup_lat, lng: b.pickup_lng },
      { lat: b.dropoff_lat, lng: b.dropoff_lng }
    );

    // Rides were uncapped until 0043 on the grounds that a long airport
    // transfer is legitimate. They now answer to the same admin-set
    // max_distance_km as food and shop, so there is ONE answer on the
    // platform to "how far is too far". It ships as null (no limit), which
    // keeps that original behaviour until an admin sets a number.
    //
    // A null distance is never "too far" — same rule as exceedsMaxRadius:
    // we cannot prove it either way, and refusing on missing coordinates
    // would block every booking made without a map pin.
    const maxDistanceKm = await getMaxDistanceKm();
    if (exceedsMaxRadius(distanceKm, maxDistanceKm)) {
      return res.status(422).json({
        error: `This trip is about ${Math.round(distanceKm)} km — beyond our ${maxDistanceKm} km limit.`,
        failure_reason: 'outside_radius',
        distanceKm: Math.round(distanceKm * 100) / 100,
        maxRadiusKm: maxDistanceKm,
      });
    }
    const { amount, currency, vatAmount, vatRate, totalAmount, distanceSurcharge } = quoteFare({
      routeType: b.route_type,
      distanceKm,
    });

    // --- insert the booking (tied to the signed-in passenger) ---
    const booking = await bookingsRepository.create({
        user_id: req.userId,
        trip_type: b.trip_type,
        airport_terminal: b.airport_terminal ?? null,
        pickup_address: b.pickup_address,
        pickup_lat: b.pickup_lat ?? null,
        pickup_lng: b.pickup_lng ?? null,
        pickup_street: b.pickup_street || null,
        pickup_building: b.pickup_building || null,
        dropoff_address: b.dropoff_address,
        dropoff_lat: b.dropoff_lat ?? null,
        dropoff_lng: b.dropoff_lng ?? null,
        dropoff_street: b.dropoff_street || null,
        dropoff_building: b.dropoff_building || null,
        pickup_datetime: b.pickup_datetime,
        passenger_count: b.passenger_count ?? 1,
        luggage_count: b.luggage_count ?? 0,
        notes: b.notes ?? null,
        passenger_name: b.passenger_name,
        passenger_mobile: b.passenger_mobile ?? null,
        passenger_whatsapp: b.passenger_whatsapp,
        passenger_email: b.passenger_email ?? null,
        fare_amount: amount,
        distance_km: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
        distance_surcharge: distanceSurcharge,
        vat_amount: vatAmount,
        vat_rate: vatRate,
        total_amount: totalAmount,
        currency,
        payment_method: paymentMethod,
        // Cash needs no proof upload: the booking is confirmed right away
        // and the driver collects the fare at pickup. payment_status stays
        // at its 'awaiting_proof' default until the ride completes, so
        // revenue stats (which count 'verified') stay honest.
        ...(isCash ? { booking_status: 'confirmed' } : {}),
        // booking_code, payment_status (and booking_status for STC Pay)
        // come from database defaults.
      });

    // --- start the tracking timeline (spec section 7) ---
    await addTrackingEvent(booking.id, {
      eventType: 'booking_created',
      title: isCash ? 'Booking confirmed' : 'Booking created',
      message: isCash
        ? 'Your booking is confirmed. Pay the driver in cash at pickup.'
        : 'Your booking has been created. Please continue to payment.',
    });

    await Promise.all([
      logNotification({
        userId: req.userId,
        bookingId: booking.id,
        type: 'ride_booking_confirmed',
        code: booking.booking_code,
        title: isCash ? 'Ride booking confirmed' : 'Ride booking created',
        body: isCash
          ? 'Booking confirmed — pay your driver in cash at pickup.'
          : 'Complete payment so Alabiq can find your driver.',
        url: isCash ? `/track/${booking.booking_code}` : `/pay/${booking.booking_code}`,
      }),
      notifyAdmins({
        bookingId: booking.id,
        type: 'ride_booking_created',
        code: booking.booking_code,
        url: '/admin',
      }),
    ]);

    // Cash bookings are already confirmed — find a driver right away
    // (STC Pay bookings dispatch after the payment is verified).
    if (isCash) {
      // Lazy require: dispatch depends on realtime/geo (see lib/payments.js).
      const { startRideDispatch } = require('../lib/dispatch');
      startRideDispatch(booking.id);
    }

    // We expose booking_code (public), never the internal id.
    return res.status(201).json({
      bookingCode: booking.booking_code,
      fareAmount: booking.fare_amount,
      vatAmount: booking.vat_amount,
      vatRate: booking.vat_rate,
      // What the passenger actually pays (fare + VAT).
      totalAmount: booking.total_amount,
      currency: booking.currency,
      bookingStatus: booking.booking_status,
      paymentStatus: booking.payment_status,
      paymentMethod: booking.payment_method,
      next: isCash
        ? `/track/${booking.booking_code}`
        : `/booking/payment/stcpay/${booking.booking_code}`,
    });
  } catch (err) {
    console.error('createBooking error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// GET /api/bookings -> the signed-in passenger's own booking history.
// Powers the Transaction Records hub (spec section 6). Scoped to req.userId
// so a passenger only ever sees their own trips.
async function listMyBookings(req, res) {
  try {
    return res.json({ bookings: await bookingsRepository.listForUser(req.userId, 50) });
  } catch (err) {
    console.error('listMyBookings error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function getBookingByCode(req, res) {
  try {
    const { bookingCode } = req.params;
    const data = await bookingsRepository.byCode(bookingCode);
    if (!data) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    return res.json(data);
  } catch (err) {
    console.error('getBookingByCode error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// POST /api/bookings/:bookingCode/cancel  -> passenger cancels the trip
async function cancelBooking(req, res) {
  try {
    const { bookingCode } = req.params;
    const reason = (req.body && req.body.reason) || null;

    const booking = await bookingsRepository.cancellationDetails(bookingCode);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    // Fail closed on a null owner. user_id is null for guest rides and is
    // deliberately nulled by 0036 when an account is deleted, so the old
    // `booking.user_id &&` short-circuit let ANY signed-in user cancel a
    // stranger's ride just by knowing the code, which is public.
    if (!booking.user_id || (req.userId !== booking.user_id && req.role !== 'admin')) {
      return res.status(403).json({ error: 'You can only cancel your own booking' });
    }
    if (booking.booking_status === 'cancelled') {
      return res.status(409).json({ error: 'Booking is already cancelled' });
    }
    if (!CANCELLABLE_STATUSES.includes(booking.booking_status)) {
      return res.status(409).json({
        error: `Booking can no longer be cancelled (status: ${booking.booking_status})`,
      });
    }

    const updated = await bookingsRepository.cancel({ id: booking.id, statuses: CANCELLABLE_STATUSES });
    if (!updated) return res.status(409).json({ error: 'Booking can no longer be cancelled' });

    await addTrackingEvent(booking.id, {
      eventType: 'booking_cancelled',
      title: 'Booking cancelled',
      message: reason
        ? `The passenger cancelled this booking: ${reason}.`
        : 'The passenger cancelled this booking.',
    });

    pushBookingStatus(booking.booking_code, { bookingStatus: 'cancelled' });
    // If it was in the open feed (or claimed), pull it from drivers' lists.
    announceRequestTaken(booking.booking_code);

    return res.json({
      bookingCode: updated.booking_code,
      bookingStatus: updated.booking_status,
    });
  } catch (err) {
    console.error('cancelBooking error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// PATCH /api/bookings/:bookingCode/contact  -> owner edits their contact
// number(s) while the trip is still active (even mid-delivery), so the
// driver/admin always reach the right number. Broadcast refreshes both views.
const CONTACT_EDITABLE_STATUSES = [...CANCELLABLE_STATUSES, 'in_progress'];

async function updateBookingContact(req, res) {
  try {
    const { bookingCode } = req.params;
    const b = req.body; // validated by the route schema

    const booking = await bookingsRepository.contactDetails(bookingCode);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    // Same nullable-owner trap as cancelBooking above — fail closed.
    if (!booking.user_id || (req.userId !== booking.user_id && req.role !== 'admin')) {
      return res.status(403).json({ error: 'You can only edit your own booking' });
    }
    if (!CONTACT_EDITABLE_STATUSES.includes(booking.booking_status)) {
      return res.status(409).json({
        error: `The contact number can no longer be changed (status: ${booking.booking_status})`,
      });
    }

    const patch = {};
    if ('passenger_mobile' in b) patch.passenger_mobile = b.passenger_mobile || null;
    if ('passenger_whatsapp' in b && b.passenger_whatsapp) patch.passenger_whatsapp = b.passenger_whatsapp;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const updated = await bookingsRepository.updateContact({
      booking, userId: req.userId, isAdmin: req.role === 'admin',
      statuses: CONTACT_EDITABLE_STATUSES, patch,
    });
    if (!updated) return res.status(409).json({ error: 'The booking changed; refresh and try again' });

    await addTrackingEvent(booking.id, {
      eventType: 'contact_updated',
      title: 'Contact number updated',
      message: 'The passenger updated their contact number.',
    });
    // Driver + admin views refresh over the same channels they already watch.
    pushBookingStatus(booking.booking_code, {
      contact: { mobile: updated.passenger_mobile, whatsapp: updated.passenger_whatsapp },
    });
    const { pingAdmin } = require('../lib/realtime');
    pingAdmin(booking.booking_code);

    return res.json({
      bookingCode: updated.booking_code,
      passengerMobile: updated.passenger_mobile,
      passengerWhatsapp: updated.passenger_whatsapp,
    });
  } catch (err) {
    console.error('updateBookingContact error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { createBooking, listMyBookings, getBookingByCode, cancelBooking, updateBookingContact };
