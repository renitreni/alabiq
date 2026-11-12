// ---------------------------------------------------------------------
// MVP fare model:
//   Airport Pick & Drop — flat SAR 100 base, plus a 3.75% service fee,
//   plus a distance surcharge past the free radius, plus 15% KSA VAT.
//
//     base        = SAR 100.00
//     service fee = 3.75% of base = SAR 3.75
//     amount      = SAR 103.75   <- fare snapshot (bookings.fare_amount)
//     surcharge   = SAR   1.25   <- e.g. a 20 km trip (bookings.distance_surcharge)
//     VAT (15%)   = SAR  15.75
//     totalAmount = SAR 120.75   <- what the passenger pays
//
// `amount` is the EX-VAT fare and stays the commission base: lib/ledger.js
// computeLedger() splits it between driver and platform. VAT is the
// platform's liability to the tax authority, so it is tracked separately
// (bookings.vat_amount / total_amount, migration 0025) and never enters
// the driver's cut.
//
// THE SURCHARGE IS DELIBERATELY OUTSIDE `amount`, FOR THE SAME REASON.
// It is platform revenue, and computeLedger() pays the driver a share of
// whatever fare_amount holds — folding the surcharge in there would hand
// roughly 80% of it straight to the rider, which is the opposite of the
// intent. It sits beside VAT: inside totalAmount, outside the commission
// base. The service fee is charged on the base only, not on the surcharge.
//
// quoteFare itself never refuses a distance — it only prices one, and it
// stays pure so the money tests need no database. The cap is applied by
// the caller (controllers/bookingsController.js) from the admin-set
// max_distance_km, which since 0043 governs rides and deliveries alike.
//
// Every figure is stored as a SNAPSHOT on the booking and never
// recalculated after the passenger submits, keeping the agreed price fixed.
// ---------------------------------------------------------------------
const { vatFor } = require('./vat');
const { surchargeFor } = require('./deliveryPricing');

const FARE_BASE = 100;
const SERVICE_FEE_RATE = 0.0375; // 3.75%
const CURRENCY = 'SAR';

const { round2 } = require('./money');

// Quote a fresh fare.
//
//   distanceKm: pickup -> dropoff, or null when either end has no
//               coordinates (then there is no surcharge — never a guess).
// routeType is still accepted and still ignored, so existing callers work.
function quoteFare({ distanceKm = null } = {}) {
  const base = FARE_BASE;
  const serviceFee = round2(base * SERVICE_FEE_RATE);
  const amount = round2(base + serviceFee);

  // Platform revenue, kept out of `amount` — see the header.
  const { surcharge } = surchargeFor(distanceKm);

  // Transport is a taxable supply and the extra kilometres are part of it,
  // so VAT is charged on fare + surcharge.
  const { vatRate, vatAmount } = vatFor(amount + surcharge);
  return {
    base,
    serviceFeeRate: SERVICE_FEE_RATE,
    serviceFee,
    amount,
    distanceSurcharge: surcharge,
    vatRate,
    vatAmount,
    totalAmount: round2(amount + surcharge + vatAmount),
    currency: CURRENCY,
  };
}

// Break a stored total back into base + service fee (for receipts / instructions).
// Derived from the total so it stays correct for an existing fare snapshot.
//
// Pass `fare_amount`, NEVER `total_amount`. The ratio below only holds for
// base + service fee; total_amount also carries VAT and the distance
// surcharge, and dividing that by 1.0375 would silently invent a base fare
// that was never charged.
function fareBreakdown(total) {
  const t = round2(total);
  const base = round2(t / (1 + SERVICE_FEE_RATE));
  const serviceFee = round2(t - base);
  return { base, serviceFeeRate: SERVICE_FEE_RATE, serviceFee, total: t, currency: CURRENCY };
}

// What the passenger actually pays for a STORED booking: fare + VAT.
// Reads the snapshot rather than recomputing, and falls back to the bare
// fare for bookings created before migration 0025 (which genuinely had no
// VAT line). Use this for every charge/collect amount; use fare_amount only
// where the ex-VAT commission base is wanted.
function payableAmount(booking) {
  if (!booking) return 0;
  const total = Number(booking.total_amount);
  if (Number.isFinite(total) && total > 0) return round2(total);
  return round2(booking.fare_amount);
}

// VAT actually charged on a stored booking (0 for pre-0025 bookings).
function bookingVat(booking) {
  const vat = Number(booking && booking.vat_amount);
  return Number.isFinite(vat) && vat > 0 ? round2(vat) : 0;
}

module.exports = {
  quoteFare,
  fareBreakdown,
  payableAmount,
  bookingVat,
  FARE_BASE,
  SERVICE_FEE_RATE,
  CURRENCY,
};
