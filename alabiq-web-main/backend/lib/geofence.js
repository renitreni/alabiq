// ---------------------------------------------------------------------
// GPS-vicinity ("geofence") check before a driver may mark arrived /
// picked_up / delivered — see backend/lib/config.js's `geofence` block.
//
// Fails CLOSED: with no coordinates at all (from either source), the driver
// is rejected, not silently let through — the whole point of this check is
// that these transitions were previously fully trusted, unchecked client
// claims.
// ---------------------------------------------------------------------
const database = require('./database/pool');
const { config } = require('./config');
const { distanceMeters } = require('./geo');

// Prefer a fresh coordinate pair sent with the status-change request itself
// (a synchronous GPS read at the moment of the tap — no staleness concern).
// Fall back to the driver's latest stored ping only if it's recent enough
// to trust; POST /api/driver/location pings land every ~12s while online,
// so a few minutes' tolerance comfortably covers normal gaps without
// accepting a fix from long before the driver arrived.
async function resolveDriverPosition(driverId, bodyLat, bodyLng) {
  if (Number.isFinite(bodyLat) && Number.isFinite(bodyLng)) {
    return { lat: bodyLat, lng: bodyLng };
  }

  let loc;
  try {
    const result = await database.query(
      `SELECT lat, lng, recorded_at FROM public.driver_locations
        WHERE driver_id=$1 ORDER BY recorded_at DESC LIMIT 1`, [driverId],
    );
    loc = result.rows[0];
  } catch (error) {
    console.error('resolveDriverPosition lookup error:', error);
    return null;
  }
  if (!loc) return null;

  const ageMs = Date.now() - new Date(loc.recorded_at).getTime();
  if (ageMs > config.geofence.maxFixAgeMinutes * 60 * 1000) return null;

  return { lat: loc.lat, lng: loc.lng };
}

// Returns null when the driver is within radius (pass), or an
// { httpStatus, body } error payload for the caller to return directly.
async function assertWithinGeofence({ driverId, target, radiusMeters, bodyLat, bodyLng }) {
  if (!config.geofence.enabled) return null;

  // FAIL CLOSED on a missing pin. This used to `return null` (pass) — but
  // "nothing to check against" is indistinguishable from "the check was
  // removed", and merchant lat/lng is nullable. A merchant who cleared their
  // own pin silently disabled the pickup geofence for every delivery at
  // their location, turning the photo-proof control into an honour system.
  // A missing pin is an operations problem, not a licence to skip the check.
  if (!target || target.lat == null || target.lng == null) {
    return {
      httpStatus: 409,
      body: {
        error: 'This pickup location has no map pin set — contact Alabiq support.',
        failure_reason: 'target_location_missing',
      },
    };
  }

  const driverPos = await resolveDriverPosition(driverId, bodyLat, bodyLng);
  if (!driverPos) {
    return {
      httpStatus: 409,
      body: {
        error: 'Could not confirm your location — enable GPS and try again.',
        failure_reason: 'location_unavailable',
      },
    };
  }

  const distance = distanceMeters(driverPos, target);
  if (distance != null && distance > radiusMeters) {
    return {
      httpStatus: 409,
      body: {
        error: `You're ${Math.round(distance)}m away — get closer before confirming.`,
        failure_reason: 'too_far_from_target',
        distanceMeters: Math.round(distance),
        allowedRadiusMeters: radiusMeters,
      },
    };
  }

  return null;
}

module.exports = { resolveDriverPosition, assertWithinGeofence };
