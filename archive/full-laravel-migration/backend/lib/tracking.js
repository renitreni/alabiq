// ---------------------------------------------------------------------
// tracking_events helper.
//
// Every meaningful state change appends a timeline row that drives the
// Grab-style tracking page (spec §7). Centralized so controllers stay thin
// and event writes look identical everywhere.
// ---------------------------------------------------------------------
const database = require('./database/pool');
const { config } = require('./config');

// Append one timeline event. Best-effort: a failed event write must never
// break the primary action, so we surface the error to the caller to log
// but callers generally do not abort on it.
async function addTrackingEvent(bookingId, { eventType, title, message, createdByUserId = null }) {
  try {
    await database.query(
      `INSERT INTO public.tracking_events(booking_id,event_type,title,message,created_by_user_id)
       VALUES ($1,$2,$3,$4,$5)`, [bookingId,eventType,title ?? null,message ?? null,createdByUserId],
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
}

// The driver's most recent GPS fix, or null if it is too old to be believed.
//
// Every live map on the platform (ride tracking, food, shop) asks this same
// question, so the freshness rule lives here once rather than being re-derived
// per vertical. Without the age gate a driver whose phone died mid-trip keeps
// rendering as a confident, stationary dot forever — worse than showing no dot
// at all, because the customer waits on it instead of calling.
//
// Reuses config.dispatch.driverFreshMinutes: it is already the platform's
// definition of "this driver is live" (it decides who is eligible for an
// offer), so a driver too stale to dispatch to is exactly a driver too stale
// to draw. Deliberately NOT a second knob that could drift out of step.
//
// Returns { lat, lng, at, heading, speedKmh } | null.
async function latestDriverFix(driverId) {
  if (!driverId) return null;
  const { rows } = await database.query(
    `SELECT lat,lng,recorded_at,heading,speed_kmh FROM public.driver_locations
     WHERE driver_id=$1 ORDER BY recorded_at DESC LIMIT 1`, [driverId],
  );
  const data=rows[0];
  if (!data) return null;

  const ageMs = Date.now() - new Date(data.recorded_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs > config.dispatch.driverFreshMinutes * 60 * 1000) return null;

  return {
    lat: data.lat,
    lng: data.lng,
    at: data.recorded_at,
    heading: data.heading,
    speedKmh: data.speed_kmh,
  };
}

module.exports = { addTrackingEvent, latestDriverFix };
