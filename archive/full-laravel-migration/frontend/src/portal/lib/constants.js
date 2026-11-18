// ---------------------------------------------------------------------
// Shared constants + small presentation helpers for the portals.
// ---------------------------------------------------------------------

// Where each role lands after signing in (admins always go to their dashboard).
// Users land on the multi-service hub (/home) — Pick & Drop and Food Delivery
// are equal citizens — honoring an explicit non-root `next` first.
export function roleHome(role, next = '/') {
  if (role === 'admin') return '/admin';
  if (role === 'driver') return '/driver';
  if (role === 'merchant') return '/merchant';
  // Passengers: honor an explicit `next`, but never follow a stale one into an
  // account-type dashboard (e.g. ?next=/admin left over after switching accounts).
  const safeNext =
    next &&
    next !== '/' &&
    !next.startsWith('/admin') &&
    !next.startsWith('/driver') &&
    !next.startsWith('/merchant');
  return safeNext ? next : '/home';
}

// KSA VAT, charged on top of the pre-tax amounts (mirrors backend lib/vat.js).
// Display only — every amount actually charged comes from the server, and a
// stored order/booking carries the rate it was really billed at.
export const VAT_RATE = 0.15;

// "VAT (15%)". Prefers the rate stored on the row so a receipt reprinted
// after a rate change still shows what was charged.
export function vatLabel(rate) {
  const r = Number(rate);
  const pct = Number.isFinite(r) && r > 0 ? r * 100 : VAT_RATE * 100;
  return `VAT (${Math.round(pct * 100) / 100}%)`;
}

// Fare model (mirrors backend lib/fare.js): flat base + 3.75% service fee,
// then 15% VAT on top. `fareTotal` is the ex-VAT fare that gets stored as
// bookings.fare_amount; `total` is what the passenger pays.
export const FARE_BASE = 100;
export const SERVICE_FEE_RATE = 0.0375;

export function fareBreakdown() {
  const round2 = (n) => Math.round(n * 100) / 100;
  const base = FARE_BASE;
  const serviceFee = round2(base * SERVICE_FEE_RATE);
  const fareTotal = round2(base + serviceFee);
  const vatAmount = round2(fareTotal * VAT_RATE);
  return {
    base,
    serviceFeeRate: SERVICE_FEE_RATE,
    serviceFeePercent: +(SERVICE_FEE_RATE * 100).toFixed(2),
    serviceFee,
    fareTotal,
    vatRate: VAT_RATE,
    vatAmount,
    total: round2(fareTotal + vatAmount),
  };
}

// Riyadh airports with approximate coordinates (used for map + matching).
export const AIRPORTS = [
  { id: 'kkia_t1', name: 'King Khalid Intl — Terminal 1', lat: 24.9576, lng: 46.7012 },
  { id: 'kkia_t2', name: 'King Khalid Intl — Terminal 2', lat: 24.9618, lng: 46.6952 },
  { id: 'kkia_t5', name: 'King Khalid Intl — Terminal 5', lat: 24.9489, lng: 46.7026 },
];

/** Dropdown options with terminal name prominent and airport as secondary line. */
export function airportDropdownOptions() {
  return AIRPORTS.map((a) => {
    const sep = a.name.indexOf(' — ');
    if (sep === -1) return { value: a.id, label: a.name };
    return { value: a.id, label: a.name.slice(sep + 3), sublabel: a.name.slice(0, sep) };
  });
}

export const RIYADH_CENTER = { lat: 24.7136, lng: 46.6753 };

// Human-friendly labels + colors for booking statuses.
export const BOOKING_STATUS = {
  pending_payment: { label: 'Awaiting payment', tone: 'amber' },
  payment_under_review: { label: 'Payment under review', tone: 'amber' },
  confirmed: { label: 'Finding your driver', tone: 'blue' },
  driver_assigned: { label: 'Driver assigned', tone: 'blue' },
  driver_on_the_way: { label: 'Driver on the way', tone: 'blue' },
  arrived: { label: 'Driver has arrived', tone: 'green' },
  in_progress: { label: 'On the trip', tone: 'green' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export const TONE_CLASSES = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  grey: 'bg-brand-surface text-brand-grey border-brand-border',
};

export function statusMeta(bookingStatus) {
  return BOOKING_STATUS[bookingStatus] || { label: bookingStatus || 'Unknown', tone: 'grey' };
}

// Human-friendly labels + colors for Pick & Drop payment statuses (mirrors
// the payment_status enum in the DB). Used by the Transaction Records hub.
export const RIDE_PAYMENT_STATUS = {
  awaiting_proof: { label: 'Awaiting payment', tone: 'amber' },
  proof_uploaded: { label: 'Payment under review', tone: 'amber' },
  under_review: { label: 'Payment under review', tone: 'amber' },
  verified: { label: 'Paid', tone: 'green' },
  rejected: { label: 'Payment rejected', tone: 'red' },
  refunded: { label: 'Refunded', tone: 'grey' },
};

export function ridePaymentMeta(status, method) {
  // Cash rides carry no online proof: until the driver collects the fare
  // (which marks the booking verified), show a cash-specific pending label.
  if (method === 'cash' && status !== 'verified') {
    return { label: 'Cash — pay driver', tone: 'blue' };
  }
  return RIDE_PAYMENT_STATUS[status] || { label: status || 'Unknown', tone: 'grey' };
}

// Build a WhatsApp deep link from a phone number (strips non-digits).
export function whatsappLink(number, text) {
  if (!number) return null;
  const digits = String(number).replace(/[^\d]/g, '');
  if (!digits) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${q}`;
}

// Turn-by-turn navigation to a destination, in Google Maps. Returns null when
// there is nothing safe to navigate to, so callers keep the `{link && <a>}`
// pattern they already use for whatsappLink above.
//
// Google Maps, not Waze: Waze has little presence in Saudi Arabia, so the old
// waze.com/ul link dropped drivers into an app most of them do not have.
//
// The destination must be WHERE THE CUSTOMER ACTUALLY POINTED. That is why
// this takes an explicit {lat, lng} and never accepts a value that has been
// through resolveCoordsFromAddress() — that helper falls back to an airport,
// district, or whole-city centroid when a booking has no pin, which is fine
// for drawing an approximate marker on a map and actively harmful for
// navigation. Sending a driver confidently to the middle of Riyadh is worse
// than admitting we do not know.
//
// So, in order: real coordinates, else the customer's own address text (let
// Google geocode what they typed — still their location, not one we invented),
// else null and the button disappears.
//
// omitting `origin` starts navigation from the device's live position, and
// dir_action=navigate launches turn-by-turn rather than a route preview.
// On Android the https link is handed to the Google Maps app by app-links,
// which is the same mechanism the old Waze link relied on.
export function googleMapsNavLink({ lat, lng, address } = {}) {
  // Number.isFinite, NOT a truthiness check: lat/lng of 0 are valid
  // coordinates and `!lat` would silently discard them.
  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    && lat !== null && lng !== null && lat !== '' && lng !== '';
  // Coordinates go in literally (digits, dot, minus, comma are all URL-safe,
  // and Google's own examples use a bare comma — some Android intent filters
  // are fussier about %2C than the web handler is). Free-text addresses do
  // need encoding.
  const destination = hasCoords
    ? `${Number(lat)},${Number(lng)}`
    : encodeURIComponent(address ? String(address).trim() : '');
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving&dir_action=navigate`;
}

// Statuses where the passenger may still cancel (mirrors the backend rule).
export const CANCELLABLE = [
  'pending_payment',
  'payment_under_review',
  'confirmed',
  'driver_assigned',
  'driver_on_the_way',
  'arrived',
];

// --- Food Delivery ---------------------------------------------------

// Business rules mirrored from backend lib/foodMoney.js for DISPLAY ONLY —
// the server re-validates all of them at checkout/accept.
export const FOOD_MIN_ORDER = 30;
export const FOOD_DELIVERY_FEE = 10;
export const FOOD_RADIUS_KM = 15;
export const MERCHANT_CREDIT_LIMIT = 300;
export const MERCHANT_CREDIT_ALERT = 240; // 80% of the 300 SAR limit

// Currency shown as `SAR 30.00` consistently across the food screens.
export function fmtSAR(amount) {
  return `SAR ${Number(amount ?? 0).toFixed(2)}`;
}

// Merchant-uploaded photos only. Bundled `/products/*.svg` cartoons and
// missing local `.jpg` paths are not catalogue photography.
export function liveProductImage(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return '';
}

// Absolute timestamps are pinned to Riyadh, not the reader's machine: an
// admin diagnosing an incident from another timezone has to be able to
// compare what they see here against the server log and a driver's account
// of when it happened. Pair it with relativeTime() from lib/notifications.js
// when both "when exactly" and "how long ago" are useful.
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Riyadh',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// merchants.badge is snake_case, constrained by the DB to these four values
// (0015_merchant_homepage_presentation.sql) and echoed by the route whitelist
// in backend/routes/admin.js. Lives here, in the shared constants module,
// because the portal discovery rows, the marketing cards and the admin
// dropdown all render it — an unmapped value shows no badge at all, so a
// second copy is a badge that silently stops appearing on one surface.
export const BADGE_LABELS = {
  top_rated: 'Top Rated',
  popular: 'Popular',
  new: 'New',
  trending: 'Trending',
};

// --- Delivery fee copy -----------------------------------------------
//
// The base fee is a FLOOR, never the final price: the server adds
// surchargePerKm for every km past freeRadiusKm (backend
// lib/deliveryPricing.js), and no discovery screen knows the customer's
// address, so no discovery screen can compute the real number.
//
// Both helpers return null rather than a fallback string when the terms are
// missing or zero. That is deliberate and is the bug they exist to fix:
// "Free delivery" used to be rendered whenever the fee was absent — a
// commitment we do not make, shown most often exactly when the request had
// failed and we knew nothing at all. A missing fee must render nothing.
//
// `terms` is the `delivery` object the discovery endpoints return; the bare
// `deliveryFee` number from an older response is accepted too so a cached
// bundle degrades to "From SAR 10" instead of throwing.
function deliveryBaseFee(terms) {
  const fee = Number(terms && typeof terms === 'object' ? terms.baseFee : terms);
  return Number.isFinite(fee) && fee > 0 ? fee : null;
}

export function deliveryFeeFromLabel(terms) {
  const fee = deliveryBaseFee(terms);
  return fee == null ? null : `From ${fmtSAR(fee)}`;
}

// The rule in one line, for the page header rather than every card.
export function deliveryFeeNote(terms) {
  const fee = deliveryBaseFee(terms);
  if (fee == null || !terms || typeof terms !== 'object') return null;
  const { freeRadiusKm, surchargePerKm } = terms;
  if (!Number.isFinite(Number(freeRadiusKm)) || !Number.isFinite(Number(surchargePerKm))) {
    return null;
  }
  return (
    `${fmtSAR(fee)} delivery within ${freeRadiusKm} km, ` +
    `then ${fmtSAR(surchargePerKm)} per km`
  );
}

// Human-friendly labels + colors for food order statuses.
export const FOOD_ORDER_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  accepted: { label: 'Accepted', tone: 'blue' },
  preparing: { label: 'Preparing', tone: 'blue' },
  ready: { label: 'Ready', tone: 'blue' },
  out_for_delivery: { label: 'Out for delivery', tone: 'blue' },
  delivered: { label: 'Delivered', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  rejected: { label: 'Rejected', tone: 'red' },
};

export const FOOD_PAYMENT_STATUS = {
  awaiting: { label: 'Awaiting payment', tone: 'amber' },
  paid: { label: 'Paid', tone: 'green' },
  failed: { label: 'Payment failed', tone: 'red' },
  refunded: { label: 'Refunded', tone: 'grey' },
};

export function foodStatusMeta(status) {
  return FOOD_ORDER_STATUS[status] || { label: status || 'Unknown', tone: 'grey' };
}

export function foodPaymentMeta(status) {
  return FOOD_PAYMENT_STATUS[status] || { label: status || 'Unknown', tone: 'grey' };
}

// The fulfillment ladder shown on the tracking stepper. `desc` is the
// notification-style line shown under the currently active step.
// The customer-visible ladder.
//
// 'rider_to_restaurant' is NOT an order status — the order sits at 'ready'
// throughout it. It is derived from the delivery row (status 'assigned',
// i.e. a rider has the job but has not collected the food yet), because
// "waiting for a rider" and "a named rider is four minutes from the
// restaurant" feel completely different to someone watching the page, and
// the data to tell them apart was already there unused.
// See trackStepIndex() below for how the two sources are merged.
export const FOOD_TRACK_STEPS = [
  { id: 'pending', label: 'Order placed', desc: 'Waiting for the restaurant to confirm your order.' },
  { id: 'accepted', label: 'Confirmed', desc: 'The restaurant confirmed your order.' },
  { id: 'preparing', label: 'Preparing', desc: 'The restaurant is preparing your order.' },
  { id: 'ready', label: 'Ready', desc: 'Your order is ready and waiting for the rider.' },
  { id: 'rider_to_restaurant', label: 'Rider on the way to the restaurant', desc: 'Your rider is heading to the restaurant to collect your order.' },
  { id: 'out_for_delivery', label: 'Picked up — heading to you', desc: 'Your rider has your order and is on the way.' },
  { id: 'delivered', label: 'Delivered', desc: 'Enjoy your meal.' },
];

export const FOOD_PAYMENT_METHODS = {
  stcpay: 'STC Pay',
  tap: 'Card',
  cash: 'Cash on delivery',
};

// --- Ecommerce ("shop") ----------------------------------------------

// Business rules mirrored from backend lib/shopMoney.js for DISPLAY ONLY —
// the server re-validates all of them at checkout/accept. The credit limit
// is shared with food (one credit model, one set of columns).
export const SHOP_MIN_ORDER = 50;
export const SHOP_DELIVERY_FEE = 15;
export const SHOP_RADIUS_KM = 15;

export const SHOP_ORDER_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  accepted: { label: 'Accepted', tone: 'blue' },
  packing: { label: 'Packing', tone: 'blue' },
  ready: { label: 'Ready', tone: 'blue' },
  out_for_delivery: { label: 'Out for delivery', tone: 'blue' },
  delivered: { label: 'Delivered', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  rejected: { label: 'Rejected', tone: 'red' },
};

// Payment statuses are the same enum as food (fd_payment_status is shared).
export function shopStatusMeta(status) {
  return SHOP_ORDER_STATUS[status] || { label: status || 'Unknown', tone: 'grey' };
}

export const shopPaymentMeta = foodPaymentMeta;

// The fulfillment ladder shown on the tracking stepper.
// Same shape and same derived rider step as FOOD_TRACK_STEPS above.
export const SHOP_TRACK_STEPS = [
  { id: 'pending', label: 'Order placed', desc: 'Waiting for the store to confirm your order.' },
  { id: 'accepted', label: 'Confirmed', desc: 'The store confirmed your order.' },
  { id: 'packing', label: 'Packing', desc: 'The store is packing your items.' },
  { id: 'ready', label: 'Ready', desc: 'Your order is packed and waiting for the rider.' },
  { id: 'rider_to_restaurant', label: 'Rider on the way to the store', desc: 'Your rider is heading to the store to collect your order.' },
  { id: 'out_for_delivery', label: 'Picked up — heading to you', desc: 'Your rider has your order and is on the way.' },
  { id: 'delivered', label: 'Delivered', desc: 'Thanks for shopping with Alabiq.' },
];

// Where the stepper's highlight sits, merging the order status with the
// delivery row.
//
// The order status alone cannot express "a rider is collecting it": food
// and shop both stay at 'ready' from the moment they are packed until the
// rider physically picks up, however long that takes. deliveryStatus
// 'assigned' is exactly that window, so it promotes the ladder one rung.
//
// Returns -1 for an unknown status, which the steppers already render as
// "nothing highlighted" rather than crashing.
export function trackStepIndex(steps, orderStatus, deliveryStatus) {
  if (orderStatus === 'ready' && deliveryStatus === 'assigned') {
    return steps.findIndex((s) => s.id === 'rider_to_restaurant');
  }
  return steps.findIndex((s) => s.id === orderStatus);
}

export const SHOP_PAYMENT_METHODS = {
  stcpay: 'STC Pay',
  tap: 'Card',
  cash: 'Cash on delivery',
};

// --- Saved cards -----------------------------------------------------
// Brands we know how to name. Anything else renders as a plain "Card"
// rather than echoing a raw gateway string at the customer.
export const CARD_BRANDS = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  mada: 'mada',
  amex: 'Amex',
  american_express: 'Amex',
  unionpay: 'UnionPay',
};

export function cardBrandLabel(brand) {
  return CARD_BRANDS[String(brand || '').toLowerCase()] || 'Card';
}

// "08/29". Returns '' when the gateway gave us no expiry rather than
// rendering "undefined/undefined".
export function cardExpiryLabel(method) {
  if (!method || !method.exp_month || !method.exp_year) return '';
  return `${String(method.exp_month).padStart(2, '0')}/${String(method.exp_year).slice(-2)}`;
}

export function savedCardLabel(method) {
  if (!method) return '';
  const parts = [cardBrandLabel(method.brand)];
  if (method.last4) parts.push(`•••• ${method.last4}`);
  const expiry = cardExpiryLabel(method);
  return expiry ? `${parts.join(' ')} · ${expiry}` : parts.join(' ');
}

// Stock is never exposed as a number to customers — the API sends a band
// instead, because an exact count polled over time reveals a store's sales
// velocity per SKU. These are the only three values a storefront ever sees.
export const AVAILABILITY = {
  in_stock: { label: 'In stock', tone: 'green' },
  low: { label: 'Only a few left', tone: 'amber' },
  out: { label: 'Out of stock', tone: 'red' },
};

export function availabilityMeta(band) {
  return AVAILABILITY[band] || AVAILABILITY.in_stock;
}
