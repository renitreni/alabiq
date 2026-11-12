// ---------------------------------------------------------------------
// Serves the /admin/ferdz demo dashboard from adminFixtures.js instead of
// the backend. request() in lib/api.js calls resolveDemo() first; anything
// that returns undefined falls through to a real fetch.
//
// Responses are computed from the SAME fixture rows the list endpoints
// return, using the aggregation the controllers use, so no two panels can
// disagree about the same number.
// ---------------------------------------------------------------------
import { store, round2 } from './adminFixtures';

const RANGE_DAYS = { day: 1, week: 7, month: 30, quarter: 90, half: 180, year: 365 };
const ACTIVE_BOOKING = ['driver_assigned', 'driver_on_the_way', 'arrived', 'in_progress'];

// Long enough for the spinners to appear, short enough not to feel broken.
const LATENCY = 180;

function query(path) {
  const q = path.indexOf('?');
  return new URLSearchParams(q === -1 ? '' : path.slice(q + 1));
}

function bare(path) {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

// The settlement builders carry a few working fields the real endpoints do
// not return; this drops them before the response goes out.
function omit(obj, keys) {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

// --- rides ------------------------------------------------------------

function stats() {
  const bookingsByStatus = {};
  const paymentsByStatus = {};
  let revenue = 0;
  let completed = 0;
  let cancelled = 0;
  let active = 0;
  let today = 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  for (const b of store.rides) {
    bookingsByStatus[b.booking_status] = (bookingsByStatus[b.booking_status] || 0) + 1;
    paymentsByStatus[b.payment_status] = (paymentsByStatus[b.payment_status] || 0) + 1;
    if (b.payment_status === 'verified') revenue += Number(b.fare_amount) || 0;
    if (b.booking_status === 'completed') completed += 1;
    if (b.booking_status === 'cancelled') cancelled += 1;
    if (ACTIVE_BOOKING.includes(b.booking_status)) active += 1;
    if (new Date(b.created_at) >= startOfToday) today += 1;
  }

  const totalDrivers = store.drivers.length;
  const approved = store.drivers.filter((d) => d.driver_approved).length;

  // Only the demo sends this key. Dashboard renders the trend when it is
  // present, so production is untouched.
  const revenueTrend = store.monthlyRevenue.map((value, idx) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (store.monthlyRevenue.length - 1 - idx), 1);
    return {
      bucket: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      revenue: value,
    };
  });

  return {
    totals: {
      bookings: store.rides.length,
      completed,
      cancelled,
      active,
      today,
      revenue: round2(revenue),
      currency: 'SAR',
      needsReview: paymentsByStatus.proof_uploaded || 0,
      awaitingPayment: paymentsByStatus.awaiting_proof || 0,
    },
    drivers: { total: totalDrivers, approved, pending: totalDrivers - approved },
    bookingsByStatus,
    paymentsByStatus,
    revenueTrend,
    generatedAt: new Date().toISOString(),
  };
}

function reports(rangeParam) {
  const range = RANGE_DAYS[rangeParam] ? rangeParam : 'month';
  const days = RANGE_DAYS[range];
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const byMonth = days > 90;

  const rows = store.rides
    .filter((b) => new Date(b.created_at) >= from)
    .map((b) => ({
      booking_code: b.booking_code,
      created_at: b.created_at,
      booking_status: b.booking_status,
      payment_status: b.payment_status,
      fare_amount: b.fare_amount,
      currency: b.currency,
      trip_type: b.trip_type,
      passenger_name: b.passenger_name,
    }))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const series = {};
  let revenue = 0;
  let completed = 0;
  let cancelled = 0;

  for (const b of rows) {
    const d = new Date(b.created_at);
    const key = byMonth
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : d.toISOString().slice(0, 10);
    if (!series[key]) series[key] = { bucket: key, count: 0, revenue: 0 };
    series[key].count += 1;
    const fare = Number(b.fare_amount) || 0;
    if (b.payment_status === 'verified') {
      series[key].revenue += fare;
      revenue += fare;
    }
    if (b.booking_status === 'completed') completed += 1;
    if (b.booking_status === 'cancelled') cancelled += 1;
  }

  return {
    range,
    granularity: byMonth ? 'month' : 'day',
    from: from.toISOString(),
    to: to.toISOString(),
    totals: { bookings: rows.length, completed, cancelled, revenue: round2(revenue), currency: 'SAR' },
    series: Object.values(series).map((s) => ({ ...s, revenue: round2(s.revenue) })),
    rows,
  };
}

function listRides(path) {
  const q = query(path);
  const limit = Math.min(Number(q.get('limit')) || 50, 200);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);

  let rows = store.rides;
  if (q.get('booking_status')) rows = rows.filter((b) => b.booking_status === q.get('booking_status'));
  if (q.get('payment_status')) rows = rows.filter((b) => b.payment_status === q.get('payment_status'));

  return {
    total: rows.length,
    limit,
    offset,
    bookings: rows.slice(offset, offset + limit),
  };
}

function rideDetail(code) {
  const booking = store.rides.find((b) => b.booking_code === code);
  if (!booking) return { __status: 404, error: 'Booking not found' };

  const driver = booking.assigned_driver_id
    ? store.drivers.find((d) => d.id === booking.assigned_driver_id) || null
    : null;

  // A demo cannot hand out a signed URL for a file that does not exist, so
  // the proof carries no downloadUrl and the viewer shows its empty state.
  const proofs = booking.payment_status === 'proof_uploaded' || booking.payment_status === 'verified'
    ? [{
        id: `${booking.id}-proof`,
        file_url: 'demo/proof.jpg',
        file_name: 'receipt.jpg',
        file_mime_type: 'image/jpeg',
        file_size_bytes: 184320,
        status: booking.payment_status === 'verified' ? 'verified' : 'pending',
        rejection_reason: null,
        reviewed_at: booking.payment_status === 'verified' ? booking.created_at : null,
        created_at: booking.created_at,
        downloadUrl: null,
      }]
    : [];

  const payments = booking.payment_status === 'verified'
    ? [{
        id: `${booking.id}-pay`,
        provider: booking.payment_method,
        amount: booking.fare_amount,
        currency: 'SAR',
        status: 'verified',
        manual_reference: `REF${booking.booking_code}`,
        verified_by_system: booking.payment_method === 'card',
        verification_mode: booking.payment_method === 'card' ? 'gateway' : 'manual',
        verified_at: booking.created_at,
        created_at: booking.created_at,
      }]
    : [];

  return {
    booking,
    proofs,
    payments,
    driver: driver
      ? { id: driver.id, full_name: driver.full_name, mobile_number: driver.mobile_number, whatsapp_number: driver.whatsapp_number }
      : null,
    driverAssignedAt: driver ? booking.created_at : null,
  };
}

function driverCashView(d) {
  const limit = Number(d.cash_owed_limit) || 500;
  const owed = round2(Number(d.cash_owed) || 0);
  const alertAt = round2(limit * 0.8);
  return {
    cashOwed: owed,
    cashOwedLimit: limit,
    cashRemaining: round2(Math.max(0, limit - owed)),
    alertAt,
    warning: owed >= alertAt && owed < limit,
    blocked: owed >= limit,
  };
}

function driverCash() {
  const drivers = [...store.drivers]
    .sort((a, b) => b.cash_owed - a.cash_owed)
    .map((d) => ({
      id: d.id,
      fullName: d.full_name,
      whatsapp: d.whatsapp_number,
      mobile: d.mobile_number,
      ...driverCashView(d),
    }));
  return { drivers, totalOwed: round2(drivers.reduce((s, d) => s + d.cashOwed, 0)) };
}

function driverDocuments(driverId) {
  const driver = store.drivers.find((d) => d.id === driverId);
  if (!driver) return { __status: 404, error: 'Driver not found' };
  const types = ['national_id', 'driving_licence', 'vehicle_registration', 'insurance'];
  return {
    driver: {
      id: driver.id,
      fullName: driver.full_name,
      email: driver.email,
      whatsapp: driver.whatsapp_number,
      driverApproved: driver.driver_approved,
      verificationStatus: driver.driver_approved ? 'verified' : 'pending',
    },
    requiredTypes: types,
    documents: types.map((doc_type, i) => ({
      id: `${driver.id}-doc-${i}`,
      doc_type,
      status: driver.driver_approved ? 'verified' : i < 2 ? 'verified' : 'pending',
      rejection_reason: null,
      file_name: `${doc_type}.jpg`,
      mime_type: 'image/jpeg',
      expiry_date: null,
      reviewed_at: driver.driver_approved ? driver.created_at : null,
      created_at: driver.created_at,
      url: null,
    })),
  };
}

// --- errors -----------------------------------------------------------

function listErrors(path) {
  const q = query(path);
  const limit = Math.min(Number(q.get('limit')) || 50, 200);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);
  const status = q.get('status') || 'open';

  let rows = store.errors;
  if (status === 'open') rows = rows.filter((e) => !e.resolved_at);
  else if (status === 'resolved') rows = rows.filter((e) => e.resolved_at);
  if (q.get('severity')) rows = rows.filter((e) => e.severity === q.get('severity'));
  if (q.get('label')) rows = rows.filter((e) => e.label === q.get('label'));
  const term = (q.get('q') || '').trim().toLowerCase();
  if (term) {
    rows = rows.filter((e) =>
      [e.label, e.message, e.path, e.user_email].some((v) => (v || '').toLowerCase().includes(term))
    );
  }

  // The list endpoint never returns stacks; only getError does.
  const errors = rows.slice(offset, offset + limit).map((e) => omit(e, ['stack', 'context']));
  return { total: rows.length, limit, offset, errors };
}

function errorSummary() {
  const open = store.errors.filter((e) => !e.resolved_at);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const byFingerprint = new Map();
  for (const e of open) {
    const row = byFingerprint.get(e.fingerprint) || { fingerprint: e.fingerprint, label: e.label, message: e.message, count: 0 };
    row.count += 1 + (e.suppressed_count || 0);
    byFingerprint.set(e.fingerprint, row);
  }
  return {
    open: open.length,
    last24h: store.errors.filter((e) => new Date(e.occurred_at).getTime() >= since).length,
    top: [...byFingerprint.values()].sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

function errorDetail(id) {
  const row = store.errors.find((e) => e.id === id);
  if (!row) return { __status: 404, error: 'Not found' };
  return {
    error_log: row,
    related: store.errors.filter((e) => e.fingerprint === row.fingerprint && e.id !== row.id).slice(0, 5),
  };
}

// --- food -------------------------------------------------------------

function foodOverview() {
  const rows = store.foodOrders;
  const counted = rows.filter((o) => !['pending', 'cancelled', 'rejected'].includes(o.status));
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return {
    totalOrders: rows.length,
    todayOrders: rows.filter((o) => new Date(o.createdAt) >= startOfToday).length,
    delivered: rows.filter((o) => o.status === 'delivered').length,
    pending: rows.filter((o) => o.status === 'pending').length,
    revenue: round2(counted.reduce((s, o) => s + o.marginTotal, 0)),
    orderVolume: round2(counted.reduce((s, o) => s + o.total, 0)),
    merchants: store.restaurants.length,
    suspendedMerchants: store.restaurants.filter((m) => m.status === 'suspended').length,
    atCreditWarning: store.restaurants.filter((m) => m.credit_used >= m.credit_limit * 0.8 && m.status !== 'suspended').length,
    paymentsAwaitingReview: rows.filter((o) => o.paymentStatus === 'awaiting').length,
    refundsOwed: rows.filter((o) => ['cancelled', 'rejected'].includes(o.status) && o.paymentStatus === 'paid').length,
  };
}

function foodMerchants() {
  return {
    merchants: store.restaurants.map((m) => ({
      id: m.id,
      name: m.name,
      cuisineType: m.cuisine_type,
      description: m.description,
      logoUrl: m.logo_url,
      address: m.address,
      street: m.street,
      buildingNumber: m.building_number,
      lat: m.lat,
      lng: m.lng,
      isActive: m.is_active,
      status: m.status,
      acceptingOrders: m.accepting_orders !== false,
      creditLimit: m.credit_limit,
      creditUsed: round2(m.credit_used),
      isFeatured: m.is_featured,
      badge: m.badge,
      ownerId: m.owner_id,
      ownerEmail: m.owner_id ? 'owner@example.com' : null,
      createdAt: m.created_at,
    })),
  };
}

function foodOrders(path) {
  const q = query(path);
  let rows = store.foodOrders;
  if (q.get('payment_status')) rows = rows.filter((o) => o.paymentStatus === q.get('payment_status'));
  if (q.get('status')) rows = rows.filter((o) => o.status === q.get('status'));
  return {
    preparingReminderMinutes: 10,
    orders: [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  };
}

function refundQueue(rows, merchantKey) {
  return {
    refunds: rows
      .filter((o) => ['cancelled', 'rejected'].includes(o.status) && (o.paymentStatus || o.payment_status) === 'paid')
      .map((o) => ({
        orderCode: o.orderCode || o.order_code,
        status: o.status,
        paymentMethod: o.paymentMethod || o.payment_method,
        total: Number(o.total),
        reason: o.rejectReason || o.reject_reason || null,
        cancelledBy: 'admin',
        cancelledAt: o.createdAt || o.created_at,
        [merchantKey]: o.merchantName || (o.merchants ? o.merchants.name : null),
      })),
  };
}

// Both settlements split the same way: prepaid orders leave us owing the
// merchant and the rider, cash orders leave the rider owing us our markup.
function settle(rows, read, labels) {
  const mapped = rows.map(read);
  const totals = {
    orders: 0,
    [labels.onlineOwed]: 0,
    onlineMarkupKept: 0,
    cashCollectedByRider: 0,
    [labels.cashPayout]: 0,
    cashMarkup: 0,
    vatCollected: 0,
    driverPayoutOwed: 0,
    driverKeptFromCash: 0,
    platformDeliveryShare: 0,
    refundedAmount: 0,
  };
  const byMerchant = new Map();

  for (const r of mapped) {
    totals.orders += 1;
    const key = r.merchantId || 'unknown';
    if (!byMerchant.has(key)) {
      byMerchant.set(key, {
        merchantId: r.merchantId,
        [labels.merchantKey]: r.merchant,
        orders: 0,
        [labels.onlineOwed]: 0,
        onlineMarkupKept: 0,
        cashCollectedByRider: 0,
        [labels.cashPayout]: 0,
        cashMarkup: 0,
        vatCollected: 0,
        refundedAmount: 0,
      });
    }
    const m = byMerchant.get(key);
    m.orders += 1;

    if (r.paymentStatus === 'refunded') {
      m.refundedAmount = round2(m.refundedAmount + r.total);
      totals.refundedAmount = round2(totals.refundedAmount + r.total);
      continue;
    }
    if (r.paymentStatus !== 'paid') continue;

    m.vatCollected = round2(m.vatCollected + r.vat);
    totals.vatCollected = round2(totals.vatCollected + r.vat);
    totals.platformDeliveryShare = round2(totals.platformDeliveryShare + r.platformDeliveryShare);

    if (r.collectedBy === 'cash_rider') {
      m.cashCollectedByRider = round2(m.cashCollectedByRider + r.total);
      m[labels.cashPayout] = round2(m[labels.cashPayout] + r.payout);
      m.cashMarkup = round2(m.cashMarkup + r.platformMarkup);
      totals.cashCollectedByRider = round2(totals.cashCollectedByRider + r.total);
      totals[labels.cashPayout] = round2(totals[labels.cashPayout] + r.payout);
      totals.cashMarkup = round2(totals.cashMarkup + r.platformMarkup);
      totals.driverKeptFromCash = round2(totals.driverKeptFromCash + r.driverFee);
    } else {
      m[labels.onlineOwed] = round2(m[labels.onlineOwed] + r.payout);
      m.onlineMarkupKept = round2(m.onlineMarkupKept + r.platformMarkup);
      totals[labels.onlineOwed] = round2(totals[labels.onlineOwed] + r.payout);
      totals.onlineMarkupKept = round2(totals.onlineMarkupKept + r.platformMarkup);
      totals.driverPayoutOwed = round2(totals.driverPayoutOwed + r.driverFee);
    }
  }

  return { mapped, totals, byMerchant: [...byMerchant.values()] };
}

function foodSettlement(path) {
  const q = query(path);
  const { mapped, totals, byMerchant } = settle(
    store.foodOrders,
    (o) => ({
      orderCode: o.orderCode,
      date: o.createdAt,
      merchantId: o.merchantId,
      merchant: o.merchantName,
      subtotal: o.subtotal,
      restaurantPayout: round2(o.subtotal - o.marginTotal),
      payout: round2(o.subtotal - o.marginTotal),
      platformMarkup: o.marginTotal,
      deliveryFee: o.deliveryFee,
      driverFee: o.driverFee,
      platformDeliveryShare: round2(o.deliveryFee - o.driverFee),
      vat: o.vatAmount,
      total: o.total,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      collectedBy: o.paymentMethod === 'cash' ? 'cash_rider' : 'platform_online',
    }),
    { onlineOwed: 'onlineOwedToRestaurant', cashPayout: 'cashRestaurantPayout', merchantKey: 'merchant' }
  );

  return {
    from: q.get('from'),
    to: q.get('to'),
    rows: mapped.map((r) => omit(r, ['payout'])),
    byMerchant: byMerchant.sort((a, b) => (a.merchant || '').localeCompare(b.merchant || '')),
    totals,
  };
}

function shopSettlement(path) {
  const q = query(path);
  const { mapped, totals } = settle(
    store.shopOrders,
    (o) => ({
      orderCode: o.order_code,
      date: o.created_at,
      merchantId: o.merchants.id,
      merchant: o.merchants.name,
      store: o.merchants.name,
      subtotal: o.subtotal,
      storePayout: round2(o.subtotal - o.platform_margin_total),
      payout: round2(o.subtotal - o.platform_margin_total),
      platformMarkup: o.platform_margin_total,
      deliveryCharge: o.delivery_fee,
      driverFee: o.driver_fee,
      platformDeliveryShare: round2(o.delivery_fee - o.driver_fee),
      vat: o.vat_amount,
      total: o.total,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      collectedBy: o.payment_method === 'cash' ? 'cash_rider' : 'platform_online',
    }),
    { onlineOwed: 'onlineOwedToStore', cashPayout: 'cashStorePayout', merchantKey: 'store' }
  );

  const orders = mapped.map((r) => omit(r, ['payout', 'merchantId', 'merchant']));
  return { from: q.get('from'), to: q.get('to'), orders, totals, count: orders.length };
}

// --- shop -------------------------------------------------------------

function shopOverview() {
  const rows = store.shopOrders;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const outOfStock = [...store.cataloguesByStore.values()]
    .flatMap((c) => c.products)
    .filter((p) => p.track_stock && p.stock_quantity <= 0).length;

  return {
    ordersToday: rows.filter((o) => new Date(o.created_at) >= startOfToday).length,
    totalOrders: rows.length,
    platformRevenue: round2(
      rows.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.platform_margin_total, 0)
    ),
    stores: store.stores.length,
    suspended: store.stores.filter((s) => s.status === 'suspended').length,
    paymentsToVerify: rows.filter((o) => o.payment_status === 'awaiting').length,
    refundsOwed: rows.filter((o) => ['cancelled', 'rejected'].includes(o.status) && o.payment_status === 'paid').length,
    outOfStockProducts: outOfStock,
  };
}

function shopStores() {
  return {
    stores: store.stores.map((m) => ({
      ...m,
      ownerEmail: m.owner_id ? 'owner@example.com' : null,
      credit: {
        creditLimit: m.credit_limit,
        creditUsed: round2(m.credit_used),
        creditRemaining: round2(m.credit_limit - m.credit_used),
        blocked: false,
      },
    })),
  };
}

function shopInventory(path) {
  const id = query(path).get('merchant_id');
  const cat = store.cataloguesByStore.get(id);
  const lowStock = cat
    ? cat.products.filter((p) => p.track_stock && p.stock_quantity <= p.low_stock_threshold)
    : [];
  return { lowStock, threshold: 5 };
}

const DEFAULT_HOURS = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opens_at: '10:00',
  closes_at: '23:00',
}));

// --- mutations --------------------------------------------------------
// Only the ones an operator would actually click during a demo. Everything
// else falls through to a generic ok, which is enough for the UI to refetch.

function setRidePayment(code, payment_status, booking_status) {
  const ride = store.rides.find((b) => b.booking_code === code);
  if (!ride) return { __status: 404, error: 'Booking not found' };
  ride.payment_status = payment_status;
  ride.booking_status = booking_status;
  return { booking_code: code, payment_status, booking_status };
}

function setFoodOrder(code, patch) {
  const order = store.foodOrders.find((o) => o.orderCode === code);
  if (!order) return { __status: 404, error: 'Order not found' };
  Object.assign(order, patch);
  return { orderCode: code, ...patch };
}

function setShopOrder(code, patch) {
  const order = store.shopOrders.find((o) => o.order_code === code);
  if (!order) return { __status: 404, error: 'Order not found' };
  Object.assign(order, patch);
  return { orderCode: code, ...patch };
}

// --- routing table ----------------------------------------------------
// First match wins, so the literal paths sit above the :id patterns.

// --- admins, settings, login activity (0043) ---------------------------

function listLoginEvents(path) {
  const q = query(path);
  const limit = Math.min(Number(q.get('limit')) || 50, 200);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);
  const rows = store.loginEvents;
  return { events: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
}

// Same aggregation the real controller does, over the same fixture rows,
// so the stat cards and the table cannot disagree.
function loginSummary(path) {
  const days = Math.min(Number(query(path).get('days')) || 30, 180);
  const since = Date.now() - days * 86400000;
  const rows = store.loginEvents.filter((e) => new Date(e.occurred_at).getTime() >= since);

  const dayAgo = Date.now() - 86400000;
  const byAdmin = new Map();
  for (const row of rows) {
    const key = row.profile_id || row.email;
    const entry = byAdmin.get(key);
    if (entry) entry.logins += 1;
    else byAdmin.set(key, { profile_id: row.profile_id, email: row.email, logins: 1, last_login: row.occurred_at });
  }
  const admins = [...byAdmin.values()].sort((a, b) => b.logins - a.logins);
  return {
    window_days: days,
    total_logins: rows.length,
    distinct_admins: admins.length,
    active_last_24h: admins.filter((a) => Date.parse(a.last_login) >= dayAgo).length,
    admins,
  };
}

const ROUTES = [
  ['GET', /^\/api\/admin\/stats$/, () => stats()],
  ['GET', /^\/api\/admin\/reports/, (p) => reports(query(p).get('range'))],

  ['GET', /^\/api\/admin\/bookings$/, (p) => listRides(p)],
  ['GET', /^\/api\/admin\/bookings\/([^/]+)$/, (p, m) => rideDetail(m[1])],
  ['POST', /^\/api\/admin\/bookings\/([^/]+)\/verify-payment$/, (p, m) => setRidePayment(m[1], 'verified', 'confirmed')],
  ['POST', /^\/api\/admin\/bookings\/([^/]+)\/reject-payment$/, (p, m) => setRidePayment(m[1], 'rejected', 'pending_payment')],
  ['POST', /^\/api\/admin\/bookings\/([^/]+)\/assign-driver$/, (p, m, body) => {
    const ride = store.rides.find((b) => b.booking_code === m[1]);
    if (!ride) return { __status: 404, error: 'Booking not found' };
    ride.assigned_driver_id = body && body.driver_id;
    ride.booking_status = 'driver_assigned';
    return { booking_code: m[1], booking_status: 'driver_assigned' };
  }],

  ['GET', /^\/api\/admin\/drivers$/, () => ({ drivers: store.drivers })],
  ['GET', /^\/api\/admin\/drivers\/cash$/, () => driverCash()],
  ['GET', /^\/api\/admin\/drivers\/([^/]+)\/documents$/, (p, m) => driverDocuments(m[1])],
  ['POST', /^\/api\/admin\/drivers\/([^/]+)\/approval$/, (p, m, body) => {
    const driver = store.drivers.find((d) => d.id === m[1]);
    if (!driver) return { __status: 404, error: 'Driver not found' };
    driver.driver_approved = !body || body.approved !== false;
    return { id: driver.id, fullName: driver.full_name, driverApproved: driver.driver_approved };
  }],
  ['POST', /^\/api\/admin\/drivers\/([^/]+)\/settle-cash$/, (p, m, body) => {
    const driver = store.drivers.find((d) => d.id === m[1]);
    if (!driver) return { __status: 404, error: 'Driver not found' };
    driver.cash_owed = round2(Math.max(0, driver.cash_owed - Number((body && body.amount) || 0)));
    return { driverId: driver.id, ...driverCashView(driver) };
  }],

  ['GET', /^\/api\/admin\/admins$/, () => ({ admins: store.admins })],
  ['GET', /^\/api\/admin\/settings$/, () => ({ max_distance_km: null })],
  ['GET', /^\/api\/admin\/login-events\/summary$/, (p) => loginSummary(p)],
  ['GET', /^\/api\/admin\/login-events$/, (p) => listLoginEvents(p)],
  ['GET', /^\/api\/admin\/errors$/, (p) => listErrors(p)],
  ['GET', /^\/api\/admin\/errors\/summary$/, () => errorSummary()],
  ['GET', /^\/api\/admin\/errors\/([^/?]+)$/, (p, m) => errorDetail(m[1])],
  ['POST', /^\/api\/admin\/errors\/([^/]+)\/resolve$/, (p, m, body) => {
    const row = store.errors.find((e) => e.id === m[1]);
    if (!row) return { __status: 404, error: 'Not found' };
    const resolved = !body || body.resolved !== false;
    row.resolved_at = resolved ? new Date().toISOString() : null;
    return { ok: true, resolved, updated: 1 };
  }],

  ['GET', /^\/api\/admin\/food\/overview$/, () => foodOverview()],
  ['GET', /^\/api\/admin\/food\/refunds$/, () => refundQueue(store.foodOrders, 'merchant')],
  ['GET', /^\/api\/admin\/food\/settlement/, (p) => foodSettlement(p)],
  ['GET', /^\/api\/admin\/food\/merchants$/, () => foodMerchants()],
  ['GET', /^\/api\/admin\/food\/merchants\/([^/]+)\/menu$/, (p, m) =>
    store.menusByMerchant.get(m[1]) || { __status: 404, error: 'Merchant not found' }],
  ['GET', /^\/api\/admin\/food\/merchants\/([^/]+)\/hours$/, () => ({ acceptingOrders: true, hours: DEFAULT_HOURS })],
  ['GET', /^\/api\/admin\/food\/orders$/, (p) => foodOrders(p)],
  ['GET', /^\/api\/admin\/food\/orders\/([^/]+)\/photos$/, () => ({ pickup: null, delivery: null })],
  ['POST', /^\/api\/admin\/food\/orders\/([^/]+)\/accept$/, (p, m) =>
    setFoodOrder(m[1], { status: 'accepted', acceptedAt: new Date().toISOString() })],
  ['POST', /^\/api\/admin\/food\/orders\/([^/]+)\/reject$/, (p, m) => setFoodOrder(m[1], { status: 'rejected' })],
  ['PATCH', /^\/api\/admin\/food\/orders\/([^/]+)\/status$/, (p, m, body) =>
    setFoodOrder(m[1], { status: body && body.status })],
  ['POST', /^\/api\/admin\/food\/orders\/([^/]+)\/verify-payment$/, (p, m) =>
    setFoodOrder(m[1], { paymentStatus: 'paid' })],
  ['POST', /^\/api\/admin\/food\/orders\/([^/]+)\/reject-payment$/, (p, m) =>
    setFoodOrder(m[1], { paymentStatus: 'failed' })],
  ['POST', /^\/api\/admin\/food\/orders\/([^/]+)\/cancel$/, (p, m) => setFoodOrder(m[1], { status: 'cancelled' })],
  ['POST', /^\/api\/admin\/food\/orders\/([^/]+)\/refund$/, (p, m) => setFoodOrder(m[1], { paymentStatus: 'refunded' })],

  ['GET', /^\/api\/admin\/shop\/overview$/, () => shopOverview()],
  ['GET', /^\/api\/admin\/shop\/refunds$/, () => refundQueue(store.shopOrders, 'store')],
  ['GET', /^\/api\/admin\/shop\/settlement/, (p) => shopSettlement(p)],
  ['GET', /^\/api\/admin\/shop\/stores$/, () => shopStores()],
  ['GET', /^\/api\/admin\/shop\/stores\/([^/]+)\/catalogue$/, (p, m) =>
    store.cataloguesByStore.get(m[1]) || { __status: 404, error: 'Store not found' }],
  ['GET', /^\/api\/admin\/shop\/stores\/([^/]+)\/hours$/, () => ({ acceptingOrders: true, hours: DEFAULT_HOURS })],
  ['GET', /^\/api\/admin\/shop\/inventory/, (p) => shopInventory(p)],
  ['GET', /^\/api\/admin\/shop\/orders$/, (p) => ({
    orders: [...store.shopOrders].filter((o) => {
      const s = query(p).get('status');
      return !s || o.status === s;
    }),
  })],
  ['GET', /^\/api\/admin\/shop\/orders\/([^/]+)\/photos$/, () => ({ pickup: null, delivery: null })],
  ['POST', /^\/api\/admin\/shop\/orders\/([^/]+)\/accept$/, (p, m) =>
    setShopOrder(m[1], { status: 'accepted', accepted_at: new Date().toISOString() })],
  ['POST', /^\/api\/admin\/shop\/orders\/([^/]+)\/reject$/, (p, m) => setShopOrder(m[1], { status: 'rejected' })],
  ['PATCH', /^\/api\/admin\/shop\/orders\/([^/]+)\/status$/, (p, m, body) =>
    setShopOrder(m[1], { status: body && body.status })],
  ['POST', /^\/api\/admin\/shop\/orders\/([^/]+)\/verify-payment$/, (p, m) =>
    setShopOrder(m[1], { payment_status: 'paid' })],
  ['POST', /^\/api\/admin\/shop\/orders\/([^/]+)\/reject-payment$/, (p, m) =>
    setShopOrder(m[1], { payment_status: 'failed' })],
  ['POST', /^\/api\/admin\/shop\/orders\/([^/]+)\/cancel$/, (p, m) => setShopOrder(m[1], { status: 'cancelled' })],
  ['POST', /^\/api\/admin\/shop\/orders\/([^/]+)\/refund$/, (p, m) => setShopOrder(m[1], { payment_status: 'refunded' })],
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function resolveDemo(path, method, body) {
  const target = bare(path);

  for (const [verb, pattern, handler] of ROUTES) {
    if (verb !== method) continue;
    const match = pattern.exec(target);
    if (!match) continue;
    await delay(LATENCY);
    const result = handler(path, match, body);
    if (result && result.__status) {
      const err = new Error(result.error || 'Not found');
      err.status = result.__status;
      throw err;
    }
    return result;
  }

  // An admin write with no fixture handler. Succeeding is the right default:
  // the caller refetches, sees unchanged demo data, and nothing breaks. The
  // alternative — falling through to the real backend — would let a demo
  // click write to production.
  if (method !== 'GET') {
    await delay(LATENCY);
    return { ok: true, demo: true };
  }

  // An unhandled GET. Returning null renders an empty panel, which is far
  // easier to spot and fix than a silent hit on the real API.
  await delay(LATENCY);
  return null;
}
