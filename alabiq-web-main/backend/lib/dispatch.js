// ---------------------------------------------------------------------
// Grab-style driver dispatch — shared by Pick & Drop rides and Food
// Delivery orders.
//
// Flow (per job):
//   1. A job becomes dispatchable (booking payment verified, or food
//      order accepted + paid).
//   2. The NEAREST online approved driver gets an exclusive offer with a
//      30-second window (dispatch_offers row + realtime push to their
//      device). "Online" = a GPS ping fresher than driverFreshMinutes.
//   3. Decline or timeout -> the offer cascades to the next-nearest
//      driver who hasn't seen this job yet.
//   4. When every candidate has passed (or none were online), the job
//      drops into the OPEN POOL — the classic first-come feed — so it is
//      never stuck waiting on the cascade.
//
// Double-claim safety is layered: the DB allows only one pending offer
// per job (partial unique index), accepting an offer is a
// compare-and-swap on the offer row, and the final claim is another
// compare-and-swap on the job itself (assigned_driver_id / deliveries
// .driver_id still null). Two drivers can never both win.
//
// The sweeper (expiring stale offers) runs in-process on the VPS server
// (started from server.js). State lives in the DB, so a restart resumes
// cleanly. On serverless there is no sweeper — jobs still reach drivers
// through the open-pool fallback.
// ---------------------------------------------------------------------
const dispatchRepository = require('../repositories/dispatchRepository');
const { config } = require('./config');
const { haversineKm } = require('./geo');
const {
  broadcast,
  announceAvailableRide,
  pingFoodAdmin,
  pingAdmin,
  pushFoodOrderStatus,
  pushMerchantFeed,
  pushBookingStatus,
  pushShopOrderStatus,
  pingShopAdmin,
} = require('./realtime');
const { logNotification } = require('./notifications');
const { logAudit } = require('./audit');
const { SERVICE_TYPES } = require('./serviceTypes');
const { sweepOrdersAwaitingPreparing } = require('./foodPreparingReminder');

// --- Candidates --------------------------------------------------------

// Latest fresh GPS fix per approved driver: { driverId -> {lat,lng,at,services} }.
async function freshDriverLocations() {
  const since = new Date(Date.now() - config.dispatch.driverFreshMinutes * 60 * 1000);
  let data;
  try {
    data = await dispatchRepository.freshDriverLocations(since, 500);
  } catch (error) {
    console.error('dispatch freshDriverLocations error:', error);
    return new Map();
  }
  const latest = new Map();
  for (const row of data || []) {
    if (!latest.has(row.driver_id)) {
      latest.set(row.driver_id, {
        lat: row.lat,
        lng: row.lng,
        at: row.recorded_at,
        services: row.service_types || SERVICE_TYPES,
      });
    }
  }
  return latest;
}

// The three job kinds, in one table so a fourth vertical is a data change
// rather than a hunt for hard-coded 'food' strings. `service` is the
// profiles.service_types value a driver must have opted into (0020);
// `column` is the dispatch_offers column that points at the job.
const KIND = {
  food: { service: 'food', column: 'order_id', offerType: 'delivery_offer' },
  ride: { service: 'pick_drop', column: 'booking_id', offerType: 'ride_offer' },
  shop: { service: 'shop', column: 'shop_order_id', offerType: 'shop_delivery_offer' },
};

// Drivers who already saw this job (any offer status) — never re-offer.
async function alreadyOfferedDriverIds(target) {
  const column = KIND[target.kind].column;
  return new Set(await dispatchRepository.offeredDriverIds(column,target.id));
}

// Drivers currently holding ANY pending offer are busy deciding — skip them.
async function busyDriverIds() {
  return new Set(await dispatchRepository.busyDriverIds());
}

// --- Targets ------------------------------------------------------------
// target = { kind: 'food', id, code, merchantId, point: {lat,lng} | null }
//        | { kind: 'ride', id, code, point: {lat,lng} | null }

async function loadFoodTarget(orderId) {
  const order = await dispatchRepository.loadFoodTarget(orderId);
  // A dropped error here used to be indistinguishable from "order not found"
  // — a DB blip could silently orphan a job (never re-offered, never dropped
  // to the open pool). Not fixed to retry (that's a bigger change to the
  // sweep loop); logged so it's visible instead of invisible.
  if (!order) return null;
  // Dispatchable once accepted and either paid up front or cash on delivery
  // (the rider collects the cash at the door).
  const paymentOk = order.payment_status === 'paid' || order.payment_method === 'cash';
  return {
    kind: 'food',
    id: order.id,
    code: order.order_code,
    paymentMethod: order.payment_method,
    merchantId: order.merchant_id,
    merchantName: order.merchant_name,
    pickupAddress: order.merchant_address,
    point: order.merchant_lat != null && order.merchant_lng != null
      ? { lat: order.merchant_lat, lng: order.merchant_lng } : null,
    active: ['accepted', 'preparing', 'ready'].includes(order.status) && paymentOk,
  };
}

// Shop: mirrors loadFoodTarget. Dispatchable once the store accepted AND
// the order is either paid or cash on delivery.
async function loadShopTarget(shopOrderId) {
  const order = await dispatchRepository.loadShopTarget(shopOrderId);
  if (!order) return null;
  const paymentOk = order.payment_status === 'paid' || order.payment_method === 'cash';
  return {
    kind: 'shop',
    id: order.id,
    code: order.order_code,
    paymentMethod: order.payment_method,
    merchantId: order.merchant_id,
    merchantName: order.merchant_name,
    pickupAddress: order.merchant_address,
    point: order.merchant_lat != null && order.merchant_lng != null
      ? { lat: order.merchant_lat, lng: order.merchant_lng } : null,
    active: ['accepted', 'packing', 'ready'].includes(order.status) && paymentOk,
  };
}

async function loadRideTarget(bookingId) {
  const b = await dispatchRepository.loadRideTarget(bookingId);
  // Same reasoning as loadFoodTarget: log rather than silently treat a DB
  // blip as "booking not found."
  if (!b) return null;
  return {
    kind: 'ride',
    id: b.id,
    code: b.booking_code,
    booking: b,
    paymentMethod: b.payment_method,
    pickupAddress: b.pickup_address,
    point: b.pickup_lat != null && b.pickup_lng != null ? { lat: b.pickup_lat, lng: b.pickup_lng } : null,
    active: b.booking_status === 'confirmed' && !b.assigned_driver_id,
  };
}

// Drivers who owe Alabiq at/over the cash cap. Coarse gate for cash-ride
// OFFERS (uses the shared config limit, not per-driver overrides) so we don't
// hand a cash ride to someone who'd be blocked from accepting it; the precise
// per-driver block lives in acceptRide / claimRide.
async function overCashCapDriverIds() {
  return new Set(await dispatchRepository.overCashCapDriverIds(config.ledger.cashOwedLimit));
}

// --- Open pool fallback ---------------------------------------------------
async function dropToOpenPool(target) {
  if (target.kind === 'food') {
    await dispatchRepository.setDeliveryOpen('food',target.id);
    broadcast('drivers-available', 'new_delivery', {
      orderCode: target.code,
      merchantName: target.merchantName,
      pickupAddress: target.pickupAddress,
    });
    pingFoodAdmin(target.code);
  } else if (target.kind === 'shop') {
    await dispatchRepository.setDeliveryOpen('shop',target.id);
    broadcast('drivers-available', 'new_delivery', {
      kind: 'shop',
      orderCode: target.code,
      merchantName: target.merchantName,
      pickupAddress: target.pickupAddress,
    });
    pingShopAdmin(target.code);
  } else {
    // Classic Pick & Drop behavior: visible to every online driver.
    // Deliberately empty: public availability only signals that the pool has
    // changed. Drivers re-read the booking through the authenticated API, so
    // addresses, coordinates, fare and tracking codes never enter this topic.
    //
    // The signal is "something changed"; drivers re-read through the
    // authenticated endpoint they already call. announceRequestTaken and the
    // admin pings were already this shape.
    announceAvailableRide();
  }
}

// --- The cascade ------------------------------------------------------------
// Offer the job to the next-nearest driver who hasn't seen it. Returns true
// when an offer went out, false when the pool fallback kicked in.
async function offerNext(target) {
  if (!target || !target.active) return false;

  // Exclude drivers over their cash-owed cap from any CASH job, in every
  // vertical. This was ride-only, which meant a rider already at the cap
  // was still offered cash food and shop deliveries -- the one case where
  // handing them more of our money is exactly what the cap forbids.
  const isCashJob = target.paymentMethod === 'cash';
  const [locations, seen, busy, overCap] = await Promise.all([
    freshDriverLocations(),
    alreadyOfferedDriverIds(target),
    busyDriverIds(),
    isCashJob ? overCashCapDriverIds() : Promise.resolve(new Set()),
  ]);

  // Only drivers who opted into this vertical (service_types, 0020).
  const requiredService = KIND[target.kind].service;
  const candidates = [...locations.entries()]
    .filter(
      ([driverId, loc]) =>
        !seen.has(driverId) &&
        !busy.has(driverId) &&
        !overCap.has(driverId) &&
        loc.services.includes(requiredService)
    )
    .map(([driverId, loc]) => ({
      driverId,
      distanceKm: target.point ? haversineKm(loc, target.point) : null,
    }))
    .sort((a, b) => {
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });

  if (candidates.length === 0) {
    await dropToOpenPool(target);
    return false;
  }

  const next = candidates[0];
  const expiresAt = new Date(Date.now() + config.dispatch.offerSeconds * 1000).toISOString();
  const jobColumn = KIND[target.kind].column;
  let offer;
  try {
    offer = await dispatchRepository.createOffer({ jobColumn,targetId: target.id,driverId: next.driverId,
      round: seen.size + 1,distanceKm: next.distanceKm != null ? Math.round(next.distanceKm * 10) / 10 : null,
      expiresAt });
  } catch (error) {
    // Unique violation = a pending offer already exists (concurrent sweep) — fine.
    if (error.code !== '23505') console.error('dispatch offerNext insert error:', error);
    return false;
  }

  // Ping exactly that driver's device.
  broadcast(`driver-${next.driverId}`, 'new_offer', {
    offerId: offer.id,
    kind: target.kind,
    code: target.code,
    expiresAt: offer.expires_at,
    distanceKm: next.distanceKm != null ? Math.round(next.distanceKm * 10) / 10 : null,
  });
  logNotification({
    userId: next.driverId,
    bookingId: target.kind === 'ride' ? target.id : null,
    orderId: target.kind === 'food' ? target.id : null,
    shopOrderId: target.kind === 'shop' ? target.id : null,
    type: KIND[target.kind].offerType,
    code: target.code,
    url: '/driver',
  });
  return true;
}

// --- Entry points -------------------------------------------------------------

// Food: called when an order is BOTH merchant-accepted and paid. Ensures the
// deliveries row exists (status 'searching') and starts the cascade.
async function startFoodDispatch(orderId) {
  try {
    const target = await loadFoodTarget(orderId);
    if (!target || !target.active) return;

    const existing = await dispatchRepository.getDelivery('food',orderId);
    if (existing && existing.driver_id) return; // already has a rider

    if (!existing) {
      try {
        await dispatchRepository.createDelivery('food',orderId);
      } catch (error) {
        if (error.code !== '23505') {
        console.error('startFoodDispatch deliveries insert error:', error);
        return;
        }
      }
    }
    await offerNext(target);
  } catch (err) {
    console.error('startFoodDispatch error:', err);
  }
}

// Shop: called when an order is BOTH store-accepted and paid (or cash).
// Mirrors startFoodDispatch against shop_deliveries.
async function startShopDispatch(shopOrderId) {
  try {
    const target = await loadShopTarget(shopOrderId);
    if (!target || !target.active) return;

    const existing = await dispatchRepository.getDelivery('shop',shopOrderId);
    if (existing && existing.driver_id) return; // already has a rider

    if (!existing) {
      try {
        await dispatchRepository.createDelivery('shop',shopOrderId);
      } catch (error) {
        if (error.code !== '23505') {
        console.error('startShopDispatch shop_deliveries insert error:', error);
        return;
        }
      }
    }
    await offerNext(target);
  } catch (err) {
    console.error('startShopDispatch error:', err);
  }
}

// Rides: called from payment verification (replaces the old broadcast-to-all;
// that behavior is now the fallback when no online driver is found).
async function startRideDispatch(bookingId) {
  try {
    const target = await loadRideTarget(bookingId);
    if (!target || !target.active) return;
    await offerNext(target);
  } catch (err) {
    console.error('startRideDispatch error:', err);
  }
}

// --- Release + re-dispatch (driver cancel / disconnect) -----------------------
// Return a food delivery to the cascade. ONLY valid BEFORE pickup (delivery
// status still 'assigned'); once the rider has the food it's a manual case.
// Shared by the driver-cancel endpoint and the disconnect watchdog.
// cause: 'cancelled' (driver bailed) | 'reclaimed' (driver went dark).
async function releaseFoodDelivery(
  orderId,
  { previousDriverId = null, reason = null, cause = 'cancelled', actorId = null } = {}
) {
  // Atomic release: only if still assigned (guards against a pickup landing first).
  let released;
  try {
    released = await dispatchRepository.releaseDelivery('food',orderId);
  } catch (error) {
    console.error('releaseFoodDelivery error:', error);
    return false;
  }
  if (!released) return false; // already picked up / taken over

  const order = await dispatchRepository.loadOrderSummary('food',orderId);

  if (order) {
    logAudit({
      actorId: actorId || previousDriverId || null,
      action: cause === 'reclaimed' ? 'driver_delivery_reclaimed' : 'driver_delivery_cancelled',
      resourceType: 'order',
      resourceId: order.order_code,
      meta: { previous_driver_id: previousDriverId, reason },
    });
    // Customer: "finding you a new rider". Old rider: the job left them.
    logNotification({ userId: order.customer_id, type: 'food_finding_new_rider', code: order.order_code });
    if (previousDriverId) {
      logNotification({
        userId: previousDriverId,
        type: cause === 'reclaimed' ? 'food_delivery_reclaimed' : 'food_delivery_cancelled',
        code: order.order_code,
      });
    }
    // Drop the rider card on the customer's tracking page + refresh admin/merchant.
    pushFoodOrderStatus(order.order_code, { status: order.status, rider: null });
    pushMerchantFeed(order.merchant_id, 'order_update', { orderCode: order.order_code, riderAssigned: false });
    pingFoodAdmin(order.order_code);
  }

  // Re-run the nearest-driver cascade (the canceller is excluded automatically
  // because they already appear in dispatch_offers for this job).
  await offerNext(await loadFoodTarget(orderId));
  return true;
}

// Watchdog: a rider who accepted but whose GPS has gone silent past
// abandonMinutes (and hasn't picked up yet) is treated as disconnected — the
// order is released and re-offered. Runs in-process on the VPS alongside the
// offer sweeper (no watchdog on serverless; the open pool still catches jobs).
async function sweepAbandonedDeliveries() {
  const staleBefore = Date.now() - config.dispatch.abandonMinutes * 60 * 1000;
  let rows;
  try {
    rows = await dispatchRepository.abandonedDeliveries('food',['accepted','preparing','ready']);
  } catch (error) {
    console.error('sweepAbandonedDeliveries error:', error);
    return;
  }
  for (const row of rows || []) {
    let loc;
    try {
      loc = await dispatchRepository.latestLocation(row.driver_id);
    } catch (locError) {
      // A blip here must NOT read as "never seen" (lastSeen=0) — that would
      // reclaim a live delivery out from under a driver who is actually fine.
      console.error('sweepAbandonedDeliveries location lookup error:', locError);
      continue;
    }
    const lastSeen = loc ? new Date(loc.recorded_at).getTime() : 0;
    if (lastSeen < staleBefore) {
      await releaseFoodDelivery(row.order_id, {
        previousDriverId: row.driver_id,
        cause: 'reclaimed',
        reason: 'rider_disconnected',
      });
    }
  }
}

// Return a shop delivery to the cascade. ONLY valid BEFORE pickup (delivery
// status still 'assigned'); once the rider has the goods it's a manual case.
// redispatch=false is used by order cancellation, where the job is going away
// rather than looking for another rider.
async function releaseShopDelivery(
  shopOrderId,
  { previousDriverId = null, reason = null, cause = 'cancelled', actorId = null, redispatch = true } = {}
) {
  // redispatch=false means the ORDER is going away (cancelled), not that we
  // are looking for another rider. Writing 'searching' in that case would
  // leave a cancelled order's delivery row indistinguishable from a live one
  // for anything filtering on shop_deliveries.status — including the
  // idx_shop_deliveries_open open-pool index.
  const nextStatus = redispatch ? 'searching' : 'cancelled';
  let released;
  try {
    released = await dispatchRepository.releaseDelivery('shop',shopOrderId,nextStatus);
  } catch (error) {
    console.error('releaseShopDelivery error:', error);
    return false;
  }
  if (!released) return false; // already picked up / taken over

  const order = await dispatchRepository.loadOrderSummary('shop',shopOrderId);

  if (order) {
    logAudit({
      actorId: actorId || previousDriverId || null,
      action: cause === 'reclaimed' ? 'driver_shop_delivery_reclaimed' : 'driver_shop_delivery_cancelled',
      resourceType: 'shop_order',
      resourceId: order.order_code,
      meta: { previous_driver_id: previousDriverId, reason },
    });
    if (redispatch) {
      logNotification({
        userId: order.customer_id,
        type: 'shop_finding_new_rider',
        code: order.order_code,
      });
    }
    if (previousDriverId) {
      // Distinguish "you gave this up" from "we took it back because your
      // GPS went dark" — food does, and telling a rider whose signal dropped
      // that the customer cancelled is simply untrue.
      logNotification({
        userId: previousDriverId,
        type: cause === 'reclaimed' ? 'shop_delivery_reclaimed' : 'shop_delivery_released',
        code: order.order_code,
      });
    }
    pushShopOrderStatus(order.order_code, { status: order.status, rider: null });
    pushMerchantFeed(order.merchant_id, 'order_update', {
      orderCode: order.order_code,
      riderAssigned: false,
    });
    pingShopAdmin(order.order_code);
  }

  if (redispatch) await offerNext(await loadShopTarget(shopOrderId));
  return true;
}

// Shop disconnect watchdog — same shape and same reasoning as the food one.
async function sweepAbandonedShopDeliveries() {
  const staleBefore = Date.now() - config.dispatch.abandonMinutes * 60 * 1000;
  let rows;
  try {
    rows = await dispatchRepository.abandonedDeliveries('shop',['accepted','packing','ready']);
  } catch (error) {
    console.error('sweepAbandonedShopDeliveries error:', error);
    return;
  }
  for (const row of rows || []) {
    let loc;
    try {
      loc = await dispatchRepository.latestLocation(row.driver_id);
    } catch (locError) {
      // A blip must NOT read as "never seen" — that would reclaim a live
      // delivery from a rider who is actually fine.
      console.error('sweepAbandonedShopDeliveries location lookup error:', locError);
      continue;
    }
    const lastSeen = loc ? new Date(loc.recorded_at).getTime() : 0;
    if (lastSeen < staleBefore) {
      await releaseShopDelivery(row.order_id, {
        previousDriverId: row.driver_id,
        cause: 'reclaimed',
        reason: 'rider_disconnected',
      });
    }
  }
}

// Stock expiry sweeper — ECOMMERCE ONLY, and a security control rather than
// a convenience.
//
// Shop stock is reserved at CHECKOUT, before payment, because that is the
// only way to guarantee a paid order can actually be fulfilled. The side
// effect is that an UNPAID order holds inventory. Without expiry, anyone
// could place large unpaid orders and freeze a competitor's catalogue at
// zero available stock (ECOMMERCE_PLAN §19.2, "inventory hoarding").
//
// TWO windows, because there are two ways an unpaid order can hold stock.
//
//   PENDING + awaiting (any payment method)
//     Cash is NOT exempt here. payment_method is a free client choice at
//     checkout, so exempting it left a hole with no expiry at all: one
//     account could check out every SKU in a store as `cash` and hold that
//     store at zero available stock permanently.
//
//   ACCEPTED + awaiting + non-cash
//     The subtler leak. acceptOrderCore has no payment gate — a store can
//     accept before the STC Pay proof is verified, which is legitimate. But
//     once accepted the order is no longer `pending`, so a pending-only
//     sweep skipped it forever: dispatch never starts (loadShopTarget needs
//     paid-or-cash), the stock stays reserved, and the store has already
//     been charged markup for revenue it will never see. Given a longer
//     window so a genuine proof still has time to be reviewed.
//     Cash IS exempt here: an accepted cash order is legitimately unpaid
//     right up until the rider collects at the door.
async function sweepStaleShopOrders() {
  const now = Date.now();
  const pendingCutoff = new Date(now - config.shop.orderExpiryMinutes * 60 * 1000).toISOString();
  const acceptedCutoff = new Date(now - config.shop.acceptedExpiryMinutes * 60 * 1000).toISOString();

  const [pending, accepted] = await Promise.all([
    dispatchRepository.staleShopOrders('pending',pendingCutoff),
    dispatchRepository.staleShopOrders('accepted',acceptedCutoff,{ excludeCash: true }),
  ]);

  // Tag the cohort so the audit row reports the window that actually expired
  // rather than always claiming the pending one.
  const rows = [
    ...pending.map((o) => ({ ...o, _afterMinutes: config.shop.orderExpiryMinutes })),
    ...accepted.map((o) => ({ ...o, _afterMinutes: config.shop.acceptedExpiryMinutes })),
  ];
  if (rows.length === 0) return;

  const { releaseShopStock } = require('./stock');
  for (const order of rows) {
    // CAS on the status so a store accepting at the same moment wins.
    // Both cohorts, not just 'pending': the accepted-but-unpaid expiry path
    // shares the same compare-and-swap guard.
    if (!(await dispatchRepository.cancelUnpaidShopOrder(order.id))) continue;

    await releaseShopStock(order.id);
    logAudit({
      actorId: null,
      action: 'shop_order_expired',
      resourceType: 'shop_order',
      resourceId: order.order_code,
      meta: { after_minutes: order._afterMinutes },
    });
    logNotification({
      userId: order.customer_id,
      type: 'shop_order_expired',
      code: order.order_code,
      shopOrderId: order.id,
    });
    pushShopOrderStatus(order.order_code, { status: 'cancelled' });
    pushMerchantFeed(order.merchant_id, 'order_update', {
      orderCode: order.order_code,
      status: 'cancelled',
    });
    pingShopAdmin(order.order_code);
  }
}

// Return a Pick & Drop booking to the cascade. Valid only BEFORE the trip
// starts (driver_ride_status accepted/on_the_way/arrived); once 'started' the
// passenger is in the car. cause: 'cancelled' (driver) | 'reclaimed' (watchdog).
async function releaseRide(
  bookingId,
  { previousDriverId = null, reason = null, cause = 'cancelled', actorId = null } = {}
) {
  // Atomic release: only the current driver, only pre-start.
  let booking;
  try {
    booking = await dispatchRepository.releaseRide(bookingId,previousDriverId);
  } catch (error) {
    console.error('releaseRide error:', error);
    return false;
  }
  if (!booking) return false; // trip started / already released

  logAudit({
    actorId: actorId || previousDriverId || null,
    action: cause === 'reclaimed' ? 'driver_ride_reclaimed' : 'driver_ride_cancelled',
    resourceType: 'booking',
    resourceId: booking.booking_code,
    meta: { previous_driver_id: previousDriverId, reason },
  });
  logNotification({ userId: booking.user_id, bookingId: booking.id, type: 'ride_finding_new_driver', code: booking.booking_code });
  if (previousDriverId) {
    logNotification({
      userId: previousDriverId,
      type: cause === 'reclaimed' ? 'ride_reclaimed' : 'ride_cancelled_by_you',
      code: booking.booking_code,
    });
  }
  // Drop the driver on the passenger's tracking page + refresh admin.
  pushBookingStatus(booking.booking_code, { bookingStatus: 'confirmed', driverRideStatus: null, driver: null });
  pingAdmin(booking.booking_code);

  await offerNext(await loadRideTarget(bookingId));
  return true;
}

// Ride disconnect watchdog. Deliberately narrower than the food one: only rides
// the driver has actively started heading to (on_the_way/arrived), NOT merely
// 'accepted' — a driver may accept a SCHEDULED ride hours ahead and not be
// pinging GPS yet, and we must not reclaim those.
async function sweepAbandonedRides() {
  const staleBefore = Date.now() - config.dispatch.abandonMinutes * 60 * 1000;
  let rows;
  try {
    rows = await dispatchRepository.abandonedRides();
  } catch (error) {
    console.error('sweepAbandonedRides error:', error);
    return;
  }
  for (const b of rows || []) {
    let loc;
    try {
      loc = await dispatchRepository.latestLocation(b.assigned_driver_id);
    } catch (locError) {
      // Same reasoning as sweepAbandonedDeliveries — a blip must not look
      // like "never seen" and pull an active ride out from under the driver.
      console.error('sweepAbandonedRides location lookup error:', locError);
      continue;
    }
    const lastSeen = loc ? new Date(loc.recorded_at).getTime() : 0;
    if (lastSeen < staleBefore) {
      await releaseRide(b.id, {
        previousDriverId: b.assigned_driver_id,
        cause: 'reclaimed',
        reason: 'driver_disconnected',
      });
    }
  }
}

// --- Sweeper --------------------------------------------------------------
// Expire overdue pending offers and cascade each job to the next driver.
async function sweepExpiredOffers() {
  const now = new Date().toISOString();
  let expired;
  try {
    expired = await dispatchRepository.expireOffers(now);
  } catch (error) {
    console.error('dispatch sweep error:', error);
    return;
  }
  for (const offer of expired || []) {
    broadcast(`driver-${offer.driver_id}`, 'offer_expired', { offerId: offer.id });
    let target = null;
    if (offer.order_id) target = await loadFoodTarget(offer.order_id);
    else if (offer.shop_order_id) target = await loadShopTarget(offer.shop_order_id);
    else target = await loadRideTarget(offer.booking_id);
    await offerNext(target);
  }
}

// setInterval does not wait for the previous run, so a slow pass overlaps
// the next tick. That was survivable while a stalled PostgREST call hung
// forever and the process was obviously wedged; now that every call is
// bounded at 10s (lib/httpTimeout.js), a bad pass instead takes a LONG time
// and returns -- so the 5s offer sweeper could stack a dozen concurrent runs,
// each holding pooler slots, on a single process with no bulkhead.
//
// Correctness never depended on this (the sweeps are CAS-guarded and cannot
// double-offer); this is purely about not piling up work.
function everyNonOverlapping(ms, label, run) {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    Promise.resolve()
      .then(run)
      .catch((err) => console.error(`${label}:`, err))
      .finally(() => {
        running = false;
      });
  }, ms);
}

// --- Card charges nobody confirmed ---------------------------------------
//
// The last line of the webhook backstop. Layers one and two (persisting the
// charge id, and verify-on-return) cover the customer who comes back; this
// covers the one who closes the tab. Without it a dropped webhook leaves a
// debited customer on an 'awaiting' order forever, and nothing anywhere
// says so — from our side nothing failed.
//
// Deliberately narrow: only rows that HAVE a charge id (so there is
// something to ask Tap about), only inside the age window, and only a
// batch at a time. Tap's API is rate limited and this runs unattended.
async function sweepUnconfirmedCharges() {
  if (!config.tap.secretKey) return; // card payments not configured
  const { settleCharge } = require('./chargeReconcile');

  const now = Date.now();
  const newest = new Date(now - config.chargeSweep.minAgeMinutes * 60000).toISOString();
  const oldest = new Date(now - config.chargeSweep.maxAgeMinutes * 60000).toISOString();

  // Rides settle to 'verified', orders to 'paid' — so "unconfirmed" is a
  // different predicate per table and cannot be one shared query.
  const sources = [
    { table: 'orders', code: 'order_code', paymentStates: ['awaiting'] },
    { table: 'shop_orders', code: 'order_code', paymentStates: ['awaiting'] },
    { table: 'bookings', code: 'booking_code', paymentStates: ['awaiting_proof','proof_uploaded','under_review'] },
  ];

  for (const source of sources) {
    let data;
    try {
      data = await dispatchRepository.unconfirmedCharges(source,newest,oldest,config.chargeSweep.batchSize);
    } catch (error) {
      console.error('sweepUnconfirmedCharges query failed', { table: source.table, error: error.message });
      continue;
    }

    for (const row of data || []) {
      const settled = await settleCharge(row.gateway_charge_id);
      // Only the interesting outcomes. 'ignored' is the normal case — a
      // charge the customer simply abandoned — and logging every pass of
      // those would bury the ones that matter.
      if (!settled.ok) {
        console.error('sweepUnconfirmedCharges could not settle', {
          table: source.table,
          code: row[source.code],
          reason: settled.reason,
        });
      } else if (settled.outcome === 'paid') {
        console.log('sweepUnconfirmedCharges recovered a lost webhook', {
          table: source.table,
          code: row[source.code],
        });
      }
    }
  }
}

let sweeperStarted = false;
function startDispatchSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  everyNonOverlapping(config.dispatch.sweepMs, 'dispatch sweeper error', sweepExpiredOffers);
  // Disconnect watchdog (food + rides) runs less often than the offer sweeper
  // (abandonMinutes is minutes, not seconds) to keep per-driver lookups cheap.
  // Sequential inside one guarded run so the three cannot overlap each other
  // either -- they all hit driver_locations.
  everyNonOverlapping(
    Math.max(config.dispatch.sweepMs, 20000),
    'dispatch abandon sweep error',
    async () => {
      await sweepAbandonedDeliveries();
      await sweepAbandonedShopDeliveries();
      await sweepAbandonedRides();
    }
  );
  // Shop stock expiry. Runs on its own, slower cadence: it is about minutes
  // of payment latency, not seconds of dispatch latency, and each pass is a
  // table scan rather than a per-driver lookup.
  everyNonOverlapping(config.shop.staleSweepMs, 'shop stale order sweep error', sweepStaleShopOrders);
  // "Kitchen never started" chase. Minutes, not seconds, and each pass is an
  // indexed range scan, so it runs on its own slow cadence like the one above.
  everyNonOverlapping(
    config.food.preparingReminderSweepMs,
    'food preparing reminder sweep error',
    sweepOrdersAwaitingPreparing
  );
  // Slowest cadence of the lot: it makes outbound gateway calls, and the
  // thing it is watching for is measured in minutes of missing webhook.
  everyNonOverlapping(
    config.chargeSweep.everyMs,
    'unconfirmed charge sweep error',
    sweepUnconfirmedCharges
  );
  console.log(
    `Dispatch sweeper running (offers expire after ${config.dispatch.offerSeconds}s; ` +
      `rider disconnect watchdog after ${config.dispatch.abandonMinutes}m; ` +
      `unpaid shop orders release stock after ${config.shop.orderExpiryMinutes}m; ` +
      `"start preparing" reminders every ${config.food.preparingReminderMinutes}m ` +
      `up to ${config.food.preparingReminderMaxCount} times; ` +
      `unconfirmed card charges re-checked with Tap after ${config.chargeSweep.minAgeMinutes}m).`
  );
}

module.exports = {
  startFoodDispatch,
  startShopDispatch,
  startRideDispatch,
  offerNext,
  loadFoodTarget,
  loadShopTarget,
  loadRideTarget,
  releaseFoodDelivery,
  releaseShopDelivery,
  releaseRide,
  sweepExpiredOffers,
  sweepAbandonedDeliveries,
  sweepAbandonedShopDeliveries,
  sweepAbandonedRides,
  sweepStaleShopOrders,
  startDispatchSweeper,
};
