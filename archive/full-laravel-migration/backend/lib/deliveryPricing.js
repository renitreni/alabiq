// ---------------------------------------------------------------------
// Distance surcharge — the SINGLE source of truth, shared by all three
// services (food delivery, shop delivery, Pick & Drop rides).
//
//     first config.delivery.freeRadiusKm  -> no surcharge
//     every km beyond it                  -> config.delivery.surchargePerKm
//
// One module rather than three copies because foodMoney and shopMoney are
// already written to mirror each other line for line, and rides now join
// them. Three copies of a money rule is three places for it to drift.
//
// WHO KEEPS IT: on rides, the platform — and that is NOT automatic, the
// surcharge must stay outside bookings.fare_amount; see lib/fare.js for why.
// On food and shop the surcharge is folded into delivery_fee and is split
// with the driver along with the rest of it (driverShareOf below): they drove
// the extra kilometres.
//
// Pure functions, no I/O. `distanceKm` is null whenever either endpoint
// has no coordinates, and a null distance always means NO surcharge —
// never a guess, and never a rejection.
// ---------------------------------------------------------------------
const { config } = require('./config');

const { round2 } = require('./money');

// The surcharge for one leg.
//
// Returns { chargeableKm, surcharge, freeRadiusKm, perKm }. chargeableKm is
// the distance past the free band (0 inside it), rounded to 2dp BEFORE being
// multiplied so the money follows from a number a human can check on the
// receipt rather than from a full-precision float.
function surchargeFor(distanceKm) {
  const freeRadiusKm = config.delivery.freeRadiusKm;
  const perKm = config.delivery.surchargePerKm;
  const distance = Number(distanceKm);

  if (distanceKm == null || !Number.isFinite(distance) || distance <= freeRadiusKm) {
    return { chargeableKm: 0, surcharge: 0, freeRadiusKm, perKm };
  }

  const chargeableKm = round2(distance - freeRadiusKm);
  return {
    chargeableKm,
    surcharge: round2(chargeableKm * perKm),
    freeRadiusKm,
    perKm,
  };
}

// Is this leg too far to serve at all?
//
// Shared by deliveries AND rides since 0043. Both now answer to the single
// admin-editable max_distance_km setting rather than rides being uncapped
// and deliveries reading DELIVERY_MAX_RADIUS_KM — two services quietly
// disagreeing about how far is too far is what made the limit so hard to
// pin down in the first place.
//
// `maxRadiusKm` of null means NO LIMIT, and is the state the platform
// ships in. It is a real value, not a missing one: lib/settings.js has
// already resolved an absent row to the configured default before this is
// called. The parameter defaults to the env value so the existing
// single-argument callers and their tests keep their old behaviour.
//
// A null distance (no coordinates) is never "too far" — we cannot prove it
// either way, and refusing on missing data would break checkout for every
// merchant without a pin.
function exceedsMaxRadius(distanceKm, maxRadiusKm = config.delivery.maxRadiusKm) {
  if (maxRadiusKm == null) return false;
  const distance = Number(distanceKm);
  if (distanceKm == null || !Number.isFinite(distance)) return false;
  return distance > maxRadiusKm;
}

// The terms behind a quoted delivery fee, for the storefront to render.
//
// Discovery pages have no delivery address — the customer only supplies one
// at checkout — so the number they can honestly show is a FLOOR, not a fee.
// Shipping the base fee on its own made every card read as the final price
// while surchargeFor above was quietly adding per-km on top at checkout.
// Returning the terms alongside it lets the UI say "from SAR 10" and print
// the rule, rather than the frontend hardcoding a copy of these numbers.
// maxRadiusKm is passed in for the same reason exceedsMaxRadius takes it:
// what the storefront ADVERTISES and what checkout ENFORCES have to be the
// same number. Reading config here while checkout reads the admin setting
// would let a card promise a 50 km limit that checkout no longer applies.
// null means no limit, and is what the platform ships with.
function deliveryTerms(baseFeeSar, maxRadiusKm = config.delivery.maxRadiusKm) {
  return {
    baseFee: round2(baseFeeSar),
    freeRadiusKm: config.delivery.freeRadiusKm,
    surchargePerKm: config.delivery.surchargePerKm,
    maxRadiusKm,
  };
}

// Split a food/shop delivery fee between the driver and the platform.
//
// Returns { driverFee, driverFeeRate } — the rate travels with the amount so
// the caller can snapshot both onto the order. Reading the rate back off the
// row is what stops a later repricing from restating deliveries already made
// and cash balances already owed against them.
//
// Rides do not use this: their split is a commission on the fare, computed by
// lib/ledger.js from a different rate, and the ride surcharge is not shared
// at all.
function driverShareOf(deliveryFee) {
  const fee = Number(deliveryFee);
  if (!Number.isFinite(fee) || fee <= 0) return { driverFee: 0, driverFeeRate: 0 };

  const platformPct = Math.min(1, Math.max(0, Number(config.delivery.platformSharePct) || 0));
  // 4dp, matching the numeric(5,4) column: round2 would flatten a 12.5%
  // share to 0.88 and quietly reprice every delivery.
  const driverFeeRate = Math.round((1 - platformPct) * 10000) / 10000;
  // Round the driver's side and let the platform take the remainder, so the
  // two halves always add back to the fee exactly. Rounding both independently
  // can lose or invent a halala.
  return { driverFee: round2(fee * driverFeeRate), driverFeeRate };
}

module.exports = { surchargeFor, exceedsMaxRadius, round2, deliveryTerms, driverShareOf };
