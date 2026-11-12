// ---------------------------------------------------------------------
// Driver dispatch controller (offers + food deliveries).
//   - listOffers          : GET  /api/driver/offers
//   - acceptOffer         : POST /api/driver/offers/:id/accept
//   - declineOffer        : POST /api/driver/offers/:id/decline
//   - listMyDeliveries    : GET  /api/driver/deliveries
//   - listOpenDeliveries  : GET  /api/driver/deliveries/available
//   - claimOpenDelivery   : POST /api/driver/deliveries/:code/claim
//   - updateDeliveryStatus: POST /api/driver/deliveries/:code/status
//
// Accepting is DOUBLE-CLAIM SAFE at three layers: the pending-offer
// unique index, a compare-and-swap on the offer row, and a final
// compare-and-swap on the job itself (deliveries.driver_id /
// bookings.assigned_driver_id must still be null to win).
// ---------------------------------------------------------------------
const driverDispatchRepository = require('../repositories/driverDispatchRepository');
const { config } = require('../lib/config');
const { haversineKm, etaMinutes } = require('../lib/geo');
const { assertWithinGeofence } = require('../lib/geofence');
const { addTrackingEvent } = require('../lib/tracking');
const { logAudit } = require('../lib/audit');
const { logNotification } = require('../lib/notifications');
const { buildDriverDocPath, createProofUploadUrl } = require('../lib/storage');
const { isBlockedFromCash, chargeDriverCashOwed, round2 } = require('../lib/driverCash');
const {
  pushBookingStatus,
  announceRequestTaken,
  pushFoodOrderStatus,
  pushMerchantFeed,
  pingFoodAdmin,
  pushShopOrderStatus,
  pingShopAdmin,
  broadcast,
} = require('../lib/realtime');
const {
  offerNext,
  loadFoodTarget,
  loadShopTarget,
  loadRideTarget,
  releaseFoodDelivery,
  releaseShopDelivery,
  releaseRide,
} = require('../lib/dispatch');
const { hasService } = require('../lib/serviceTypes');

// Order statuses during which a rider can still be working the delivery.
const RIDER_ACTIVE_ORDER_STATUSES = ['accepted', 'preparing', 'ready', 'out_for_delivery'];

// --- Offers -------------------------------------------------------------

async function listOffers(req, res) {
  try {
    const offers = await driverDispatchRepository.listOffers(req.driverId);

    return res.json({
      offers: (offers || []).map((o) => ({
        id: o.id,
        // Three job kinds since 0028. Deriving this from order_id alone used
        // to label a shop offer as a 'ride' with code undefined.
        kind: o.order_id ? 'food' : o.shop_order_id ? 'shop' : 'ride',
        code: o.order_id
          ? o.orders?.order_code
          : o.shop_order_id
            ? o.shop_orders?.order_code
            : o.bookings?.booking_code,
        distanceKm: o.distance_km,
        expiresAt: o.expires_at,
        secondsLeft: Math.max(0, Math.round((new Date(o.expires_at) - Date.now()) / 1000)),
        food: o.order_id && o.orders
          ? {
              merchantName: o.orders.merchants?.name || null,
              pickupAddress: o.orders.merchants?.address || null,
              pickupStreet: o.orders.merchants?.street || null,
              pickupBuilding: o.orders.merchants?.building_number || null,
              dropoffAddress: o.orders.delivery_address,
              dropoffStreet: o.orders.delivery_street,
              dropoffBuilding: o.orders.delivery_building,
              total: o.orders.total,
            }
          : null,
        // Same shape as `food` on purpose — the rider UI renders one card
        // for both and only swaps the label.
        shop: o.shop_order_id && o.shop_orders
          ? {
              merchantName: o.shop_orders.merchants?.name || null,
              pickupAddress: o.shop_orders.merchants?.address || null,
              pickupStreet: o.shop_orders.merchants?.street || null,
              pickupBuilding: o.shop_orders.merchants?.building_number || null,
              dropoffAddress: o.shop_orders.delivery_address,
              dropoffStreet: o.shop_orders.delivery_street,
              dropoffBuilding: o.shop_orders.delivery_building,
              total: o.shop_orders.total,
            }
          : null,
        ride: o.booking_id && o.bookings
          ? {
              tripType: o.bookings.trip_type,
              pickupAddress: o.bookings.pickup_address,
              pickupStreet: o.bookings.pickup_street,
              pickupBuilding: o.bookings.pickup_building,
              dropoffAddress: o.bookings.dropoff_address,
              dropoffStreet: o.bookings.dropoff_street,
              dropoffBuilding: o.bookings.dropoff_building,
              fareAmount: o.bookings.fare_amount,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error('listOffers error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// Returns { ok } or { conflict } — conflict means another driver already claimed it.
async function claimFoodDelivery(order, driverId) {
  // Same hard cap rides have used all along: a rider at or over their
  // cash-owed limit cannot take another cash job. Checked before the claim
  // so an over-cap rider never ends up holding more of our money.
  if (order.paymentMethod === 'cash') {
    const drv = await driverDispatchRepository.driverCashProfile(driverId);
    if (drv && isBlockedFromCash(drv)) return { ok: false, blocked: true };
  }

  const claimed = await driverDispatchRepository.claimDelivery('food', order.id, driverId);
  if (!claimed) return { ok: false, conflict: true };

  const driver = await driverDispatchRepository.driverProfile(driverId);

  pushFoodOrderStatus(order.code, {
    status: order.status,
    rider: driver
      ? { name: driver.full_name, whatsapp: driver.whatsapp_number, mobile: driver.mobile_number, status: 'assigned' }
      : { status: 'assigned' },
  });
  pushMerchantFeed(order.merchantId, 'order_update', { orderCode: order.code, riderAssigned: true });
  pingFoodAdmin(order.code);
  broadcast('drivers-available', 'delivery_taken', { orderCode: order.code });
  logNotification({ userId: order.customerId, type: 'food_rider_assigned', code: order.code });
  logAudit({
    actorId: driverId,
    action: 'driver_delivery_claimed',
    resourceType: 'order',
    resourceId: order.code,
  });
  return { ok: true };
}

// Claim a shop delivery. Same compare-and-swap as claimFoodDelivery: the
// update only lands while shop_deliveries.driver_id is still null, so two
// riders can never both win.
async function claimShopDelivery(order, driverId) {
  // Same hard cap rides have used all along: a rider at or over their
  // cash-owed limit cannot take another cash job. Checked before the claim
  // so an over-cap rider never ends up holding more of our money.
  if (order.paymentMethod === 'cash') {
    const drv = await driverDispatchRepository.driverCashProfile(driverId);
    if (drv && isBlockedFromCash(drv)) return { ok: false, blocked: true };
  }

  const claimed = await driverDispatchRepository.claimDelivery('shop', order.id, driverId);
  if (!claimed) return { ok: false, conflict: true };

  const driver = await driverDispatchRepository.driverProfile(driverId);

  pushShopOrderStatus(order.code, {
    status: order.status,
    rider: driver
      ? { name: driver.full_name, whatsapp: driver.whatsapp_number, mobile: driver.mobile_number, status: 'assigned' }
      : { status: 'assigned' },
  });
  pushMerchantFeed(order.merchantId, 'order_update', { orderCode: order.code, riderAssigned: true });
  pingShopAdmin(order.code);
  broadcast('drivers-available', 'delivery_taken', { kind: 'shop', orderCode: order.code });
  logNotification({ userId: order.customerId, type: 'shop_rider_assigned', code: order.code });
  logAudit({
    actorId: driverId,
    action: 'driver_shop_delivery_claimed',
    resourceType: 'shop_order',
    resourceId: order.code,
  });
  return { ok: true };
}

// Claim a Pick & Drop booking (same atomic update as the classic accept).
async function claimRide(bookingId, driverId) {
  // Hard block: a driver at/over their cash-owed cap cannot take a cash ride.
  // Checked before the claim so an over-cap driver never holds more of our
  // money (STC rides are unaffected).
  const pay = await driverDispatchRepository.ridePaymentMethod(bookingId);
  if (pay && pay.payment_method === 'cash') {
    const drv = await driverDispatchRepository.driverCashProfile(driverId);
    if (drv && isBlockedFromCash(drv)) return { ok: false, blocked: true };
  }

  const claimed = await driverDispatchRepository.claimRide(bookingId, driverId);
  if (!claimed) return { ok: false, conflict: true };

  const booking = claimed;
  const driver = await driverDispatchRepository.driverProfile(driverId, true);

  await addTrackingEvent(booking.id, {
    eventType: 'driver_accepted',
    title: 'Driver accepted',
    message: `${(driver && driver.full_name) || 'A driver'} accepted your trip and is on the way.`,
    createdByUserId: driverId,
  });
  pushBookingStatus(booking.booking_code, {
    bookingStatus: 'driver_assigned',
    driverRideStatus: 'accepted',
    driver: driver ? { name: driver.full_name, whatsapp: driver.whatsapp_number } : null,
  });
  announceRequestTaken(booking.booking_code);
  logNotification({
    userId: booking.user_id,
    bookingId: booking.id,
    type: 'ride_driver_accepted',
    code: booking.booking_code,
  });
  return { ok: true };
}

async function acceptOffer(req, res) {
  try {
    // CAS 1: take the offer while it is still pending and unexpired.
    const offer = await driverDispatchRepository.acceptOffer({ id: req.params.id, driverId: req.driverId });
    if (!offer) {
      return res.status(409).json({ error: 'This offer has expired or was withdrawn' });
    }

    // CAS 2: claim the job itself.
    if (offer.order_id) {
      const order = await driverDispatchRepository.orderById('food', offer.order_id);
      if (!order) return res.status(409).json({ error: 'This delivery is no longer available' });
      const result = await claimFoodDelivery(
        { id: order.id, code: order.order_code, status: order.status, merchantId: order.merchant_id, customerId: order.customer_id, paymentMethod: order.payment_method },
        req.driverId
      );
      if (!result.ok) {
        await driverDispatchRepository.cancelOffer(offer.id);
        return res.status(409).json({ error: 'This delivery was already taken' });
      }
      return res.json({ accepted: true, kind: 'food', code: order.order_code });
    }

    if (offer.shop_order_id) {
      const order = await driverDispatchRepository.orderById('shop', offer.shop_order_id);
      if (!order) return res.status(409).json({ error: 'This delivery is no longer available' });
      const result = await claimShopDelivery(
        {
          id: order.id,
          code: order.order_code,
          status: order.status,
          merchantId: order.merchant_id,
          customerId: order.customer_id,
          paymentMethod: order.payment_method,
        },
        req.driverId
      );
      if (!result.ok) {
        await driverDispatchRepository.cancelOffer(offer.id);
        return res.status(409).json({ error: 'This delivery was already taken' });
      }
      return res.json({ accepted: true, kind: 'shop', code: order.order_code });
    }

    const result = await claimRide(offer.booking_id, req.driverId);
    if (!result.ok) {
      await driverDispatchRepository.cancelOffer(offer.id);
      if (result.blocked) {
        return res.status(403).json({
          error: 'Settle your outstanding cash with Alabiq before taking new cash rides',
          failure_reason: 'cash_owed_limit_reached',
        });
      }
      return res.status(409).json({ error: 'This ride was already taken' });
    }
    const booking = await driverDispatchRepository.bookingCodeById(offer.booking_id);
    return res.json({ accepted: true, kind: 'ride', code: booking.booking_code });
  } catch (err) {
    console.error('acceptOffer error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function declineOffer(req, res) {
  try {
    const declined = await driverDispatchRepository.declineOffer({ id: req.params.id, driverId: req.driverId });
    if (!declined) {
      return res.status(409).json({ error: 'This offer is no longer pending' });
    }

    // Cascade to the next-nearest driver right away.
    //
    // Resolving the target by kind matters more here than anywhere else: a
    // shop offer used to fall through to loadRideTarget(null), which returns
    // null, so offerNext did nothing. The offer was already flipped to
    // 'declined', and the sweeper only revives 'pending' rows — so a single
    // decline killed the cascade for that order permanently.
    const offer = declined;
    let target = null;
    if (offer.order_id) target = await loadFoodTarget(offer.order_id);
    else if (offer.shop_order_id) target = await loadShopTarget(offer.shop_order_id);
    else target = await loadRideTarget(offer.booking_id);
    offerNext(target); // fire-and-forget; failures fall back to the sweeper

    return res.json({ declined: true });
  } catch (err) {
    console.error('declineOffer error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- My deliveries -------------------------------------------------------

function shapeDelivery(d) {
  const o = d.orders;
  return {
    orderCode: o.order_code,
    orderStatus: o.status,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method,
    // Cash on delivery: the rider must collect this amount at the door.
    collectCash: o.payment_method === 'cash' && o.payment_status !== 'paid' ? o.total : null,
    total: o.total,
    deliveryFee: o.delivery_fee,
    deliveryStatus: d.status,
    hasPickupPhoto: !!d.pickup_photo_path,
    merchant: o.merchants
      ? {
          name: o.merchants.name,
          address: o.merchants.address,
          street: o.merchants.street,
          buildingNumber: o.merchants.building_number,
          lat: o.merchants.lat,
          lng: o.merchants.lng,
        }
      : null,
    // The order's own contact number (editable mid-delivery) wins over the
    // profile's stored one, so the rider always calls the current number.
    customer: o.profiles
      ? {
          name: o.profiles.full_name,
          mobile: o.contact_phone || o.profiles.mobile_number,
          whatsapp: o.profiles.whatsapp_number,
        }
      : o.contact_phone
        ? { name: null, mobile: o.contact_phone, whatsapp: null }
        : null,
    dropoffAddress: o.delivery_address,
    dropoffStreet: o.delivery_street,
    dropoffBuilding: o.delivery_building,
    dropoffLat: o.delivery_lat,
    dropoffLng: o.delivery_lng,
    createdAt: o.created_at,
    deliveredAt: d.delivered_at,
  };
}

// The shop equivalent of DELIVERY_SELECT. Same columns, different tables.
//
// Written out rather than derived from DELIVERY_SELECT by string replace:
// the customer embed carries an explicit FOREIGN KEY hint
// (profiles!<constraint>_customer_id_fkey), and that constraint name differs
// per table. A naive replace of just "orders!inner" leaves the food FK name
// behind and PostgREST rejects the whole query.
async function listMyDeliveries(req, res) {
  try {
    // Both verticals in one feed. The rider works a single queue; which
    // table a job came from is an implementation detail to them, so `kind`
    // is the only thing that distinguishes the cards.
    const [food, shop] = await Promise.all([
      driverDispatchRepository.deliveryRows('food', { driverId: req.driverId, limit: 30 }),
      driverDispatchRepository.deliveryRows('shop', { driverId: req.driverId, limit: 30 }),
    ]);

    const deliveries = [
      ...food.map((d) => ({ ...shapeDelivery(d), kind: 'food' })),
      ...shop.map((d) => ({ ...shapeDelivery(d), kind: 'shop' })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({
      deliveries,
      active: deliveries.filter(
        (d) =>
          VERTICALS[d.kind].prePickupStatuses.concat('out_for_delivery').includes(d.orderStatus) &&
          d.deliveryStatus !== 'delivered'
      ),
    });
  } catch (err) {
    console.error('listMyDeliveries error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// Open pool: deliveries every driver may claim (cascade exhausted).
async function listOpenDeliveries(req, res) {
  try {
    // A rider sees only the pools they opted into. Turning a vertical off
    // yields an empty list rather than a 403 — the frontend polls this
    // silently. Admin preview bypasses both gates.
    const isAdmin = req.role === 'admin';
    const wantsFood = isAdmin || hasService(req.profile, 'food');
    const wantsShop = isAdmin || hasService(req.profile, 'shop');
    if (!wantsFood && !wantsShop) return res.json({ deliveries: [] });

    const lat = req.query.lat != null ? Number(req.query.lat) : null;
    const lng = req.query.lng != null ? Number(req.query.lng) : null;
    const here = lat != null && lng != null ? { lat, lng } : null;

    const [food, shop] = await Promise.all([
      wantsFood ? driverDispatchRepository.deliveryRows('food', { open: true, statuses: VERTICALS.food.prePickupStatuses, limit: 50 }) : [],
      wantsShop ? driverDispatchRepository.deliveryRows('shop', { open: true, statuses: VERTICALS.shop.prePickupStatuses, limit: 50 }) : [],
    ]);

    const rows = [
      ...food.map((d) => ({ row: d, kind: 'food' })),
      ...shop.map((d) => ({ row: d, kind: 'shop' })),
    ];

    const deliveries = rows.map(({ row, kind }) => {
      const shaped = { ...shapeDelivery(row), kind };
      const from = shaped.merchant && shaped.merchant.lat != null
        ? { lat: shaped.merchant.lat, lng: shaped.merchant.lng }
        : null;
      const distanceKm = here && from ? haversineKm(here, from) : null;
      return {
        ...shaped,
        distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
        etaMinutes: etaMinutes(distanceKm),
      };
    });
    deliveries.sort((a, b) => {
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });

    return res.json({ deliveries });
  } catch (err) {
    console.error('listOpenDeliveries error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function claimOpenDelivery(req, res) {
  try {
    const V = verticalForCode(req.params.code);
    if (req.role !== 'admin' && !hasService(req.profile, V.service)) {
      return res.status(403).json({
        error: `Enable ${V.label} in your services to claim these deliveries`,
      });
    }

    const order = await driverDispatchRepository.orderByCode(V.key, req.params.code);
    if (!order) return res.status(404).json({ error: 'Delivery not found' });

    // The open POOL means status 'open'. Rows start life as 'searching'
    // during the exclusive cascade, and the claim helpers match only on
    // driver_id IS NULL — so without this a rider who knows an order code
    // could take a job out from under whoever currently holds the offer.
    // The filter cannot live in the helper: acceptOffer legitimately claims
    // a 'searching' row.
    const deliveryRow = await driverDispatchRepository.deliveryByOrder(V.key, order.id);
    if (!deliveryRow || deliveryRow.status !== 'open') {
      return res.status(409).json({ error: 'This delivery is not in the open pool' });
    }

    const claim = V.key === 'shop' ? claimShopDelivery : claimFoodDelivery;
    const result = await claim(
      { id: order.id, code: order.order_code, status: order.status, merchantId: order.merchant_id, customerId: order.customer_id, paymentMethod: order.payment_method },
      req.driverId
    );
    if (!result.ok) return res.status(409).json({ error: 'This delivery was already taken' });
    return res.json({ accepted: true, kind: V.key, code: order.order_code });
  } catch (err) {
    console.error('claimOpenDelivery error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// POST /api/driver/deliveries/:code/cancel { reason? }
// A rider gives up a delivery they accepted but has NOT picked up yet. The order
// is released and instantly re-offered to the next-nearest driver (the canceller
// is excluded from the cascade). After pickup this is refused — the food is with
// the rider, so a support/admin path must handle it.
async function cancelDelivery(req, res) {
  try {
    const V = verticalForCode(req.params.code);
    const order = await driverDispatchRepository.orderByCode(V.key, req.params.code);
    if (!order) return res.status(404).json({ error: 'Delivery not found' });

    const delivery = await driverDispatchRepository.deliveryByOrder(V.key, order.id);
    if (!delivery || delivery.driver_id !== req.driverId) {
      return res.status(403).json({ error: 'This delivery is not assigned to you' });
    }
    if (delivery.status !== 'assigned' || !V.prePickupStatuses.includes(order.status)) {
      return res.status(409).json({ error: 'You can only cancel before you pick up the order' });
    }

    const released = await V.release(order.id, {
      previousDriverId: req.driverId,
      reason: req.body.reason || null,
      cause: 'cancelled',
      actorId: req.driverId,
    });
    if (!released) {
      return res.status(409).json({ error: 'This delivery can no longer be cancelled' });
    }
    return res.json({ cancelled: true, code: order.order_code });
  } catch (err) {
    console.error('cancelDelivery error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// POST /api/driver/rides/:code/cancel { reason? }
// A driver gives up a Pick & Drop ride they accepted but has NOT started yet.
// The booking is released back to 'confirmed' and re-offered to the next-nearest
// driver (unlike the terminal 'cancelled' status, the passenger keeps their
// trip). Once the trip has started this is refused.
async function cancelRide(req, res) {
  try {
    const booking = await driverDispatchRepository.rideByCode(req.params.code);
    if (!booking) return res.status(404).json({ error: 'Ride not found' });
    if (booking.assigned_driver_id !== req.driverId) {
      return res.status(403).json({ error: 'This ride is not assigned to you' });
    }
    if (!['accepted', 'on_the_way', 'arrived'].includes(booking.driver_ride_status)) {
      return res.status(409).json({ error: 'You can only cancel before the trip starts' });
    }

    const released = await releaseRide(booking.id, {
      previousDriverId: req.driverId,
      reason: req.body.reason || null,
      cause: 'cancelled',
      actorId: req.driverId,
    });
    if (!released) {
      return res.status(409).json({ error: 'This ride can no longer be cancelled' });
    }
    return res.json({ cancelled: true, code: booking.booking_code });
  } catch (err) {
    console.error('cancelRide error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Delivery lifecycle (rider side) ---------------------------------------
// PHOTO PROOF IS MANDATORY at both steps (Grab-style accountability):
// picked_up -> photo of the order AT THE RESTAURANT, then the customer sees
//              "on the way"                     (order: out_for_delivery)
// delivered -> photo of the handover at the door (order: delivered; a cash
//              order records the collected payment here)
// Everything that differs between a food delivery and a shop delivery, in
// one place. The rider-side flow is otherwise identical: exclusive offer,
// claim, photo at pickup, photo at handover, cash collected at the door.
//
// The vertical is resolved from the ORDER CODE PREFIX (FD- vs SH-), which is
// the only thing the rider's URL carries. Codes are generated by
// gen_order_code() / gen_shop_order_code() and are unique per table.
const VERTICALS = {
  food: {
    key: 'food',
    orderTable: 'orders',
    deliveryTable: 'deliveries',
    service: 'food',
    label: 'Food delivery',
    pickupLabel: 'restaurant',
    // Order statuses from which a rider may still mark picked_up.
    prePickupStatuses: ['accepted', 'preparing', 'ready'],
    auditResource: 'order',
    notify: {
      picked_up: 'food_order_out_for_delivery',
      delivered: 'food_order_delivered',
      thanks: 'food_thank_you',
    },
    pushStatus: (...a) => pushFoodOrderStatus(...a),
    pingAdmin: (...a) => pingFoodAdmin(...a),
    release: (...a) => releaseFoodDelivery(...a),
    markPaid: (order, opts) => require('./food/ordersController').markOrderPaid(order, opts),
  },
  shop: {
    key: 'shop',
    orderTable: 'shop_orders',
    deliveryTable: 'shop_deliveries',
    service: 'shop',
    label: 'Store delivery',
    pickupLabel: 'store',
    // 'packing' replaces food's 'preparing'.
    prePickupStatuses: ['accepted', 'packing', 'ready'],
    auditResource: 'shop_order',
    notify: {
      picked_up: 'shop_order_out_for_delivery',
      delivered: 'shop_order_delivered',
      thanks: null, // shop_order_delivered already carries the thank-you
    },
    pushStatus: (...a) => pushShopOrderStatus(...a),
    pingAdmin: (...a) => pingShopAdmin(...a),
    release: (...a) => releaseShopDelivery(...a),
    markPaid: (order, opts) => require('./shop/ordersController').markShopOrderPaid(order, opts),
  },
};

function verticalForCode(code) {
  return String(code || '').toUpperCase().startsWith('SH-') ? VERTICALS.shop : VERTICALS.food;
}

const DELIVERY_FLOW = {
  picked_up: {
    orderStatus: 'out_for_delivery',
    deliveryStatus: 'picked_up',
    photoColumn: 'pickup_photo_path',
  },
  delivered: {
    orderStatus: 'delivered',
    deliveryStatus: 'delivered',
    photoColumn: 'delivery_photo_path',
  },
};

// POST /api/driver/deliveries/:code/photo-url { kind, file_name, mime_type }
// Signed upload URL for the mandatory proof photo (private proofs bucket,
// path <ORDER-CODE>/pickup-... or <ORDER-CODE>/delivery-...).
async function createDeliveryPhotoUrl(req, res) {
  try {
    const { kind, file_name, mime_type } = req.body;
    if (!mime_type || !config.proofs.allowedMimeTypes.includes(mime_type)) {
      return res.status(400).json({
        error: `mime_type is required and must be one of: ${config.proofs.allowedMimeTypes.join(', ')}`,
      });
    }

    const V = verticalForCode(req.params.code);
    const order = await driverDispatchRepository.orderByCode(V.key, req.params.code);
    if (!order) return res.status(404).json({ error: 'Delivery not found' });

    const delivery = await driverDispatchRepository.deliveryByOrder(V.key, order.id);
    if (!delivery || delivery.driver_id !== req.driverId) {
      return res.status(403).json({ error: 'This delivery is not assigned to you' });
    }

    const path = buildDriverDocPath(order.order_code, kind, file_name);
    const { token, signedUrl } = await createProofUploadUrl(path);
    return res.status(201).json({
      bucket: config.proofs.bucket,
      path,
      token,
      signedUrl,
      maxBytes: config.proofs.maxBytes,
    });
  } catch (err) {
    console.error('createDeliveryPhotoUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

async function updateDeliveryStatus(req, res) {
  try {
    const flow = DELIVERY_FLOW[req.body.status];
    if (!flow) {
      return res.status(400).json({
        error: `status must be one of: ${Object.keys(DELIVERY_FLOW).join(', ')}`,
      });
    }
    // No photo, no status change — the proof is the whole point.
    const V = verticalForCode(req.params.code);
    const photoPath = req.body.photo_path;
    // Also rejects traversal: the key must sit directly under this order's
    // own folder, with no path segments of the caller's choosing.
    const pathOk =
      photoPath &&
      String(photoPath).startsWith(`${req.params.code}/`) &&
      !String(photoPath).includes('..') &&
      String(photoPath).split('/').length === 2;
    if (!pathOk) {
      return res.status(400).json({
        error: req.body.status === 'picked_up'
          ? `Take a photo of the order at the ${V.pickupLabel} first`
          : 'Take a photo of the delivered order first',
      });
    }

    // The shape check above proves the KEY is well-formed. It does not prove
    // anything was ever uploaded — a rider could post a made-up filename and
    // the order would advance with the store's dashboard showing a photo that
    // resolves to nothing. "Mandatory photo proof" has to mean the object
    // exists, so confirm it does before moving any money or status.
    const fileName = String(photoPath).split('/')[1];
    const uploaded = await require('../lib/objectStorage').listObjects(config.proofs.bucket, req.params.code);
    if (!uploaded.some((object) => object.Key === photoPath || object.Key === `${req.params.code}/${fileName}`)) {
      return res.status(400).json({
        error: 'The photo did not finish uploading — please try again.',
        failure_reason: 'photo_missing',
      });
    }

    const order = await driverDispatchRepository.orderByCode(V.key, req.params.code);
    if (!order) return res.status(404).json({ error: 'Delivery not found' });

    const delivery = await driverDispatchRepository.deliveryByOrder(V.key, order.id);
    if (!delivery || delivery.driver_id !== req.driverId) {
      return res.status(403).json({ error: 'This delivery is not assigned to you' });
    }
    const fromStatuses =
      req.body.status === 'picked_up' ? V.prePickupStatuses : ['out_for_delivery'];
    if (!fromStatuses.includes(order.status)) {
      return res.status(409).json({ error: `Cannot mark ${req.body.status} from "${order.status}"` });
    }

    // Previously a fully trusted, unchecked client claim — a driver could
    // mark picked_up/delivered from anywhere. picked_up checks against the
    // restaurant; delivered checks against the drop-off address.
    const geofenceTarget = req.body.status === 'picked_up'
      ? { lat: order.merchant_lat, lng: order.merchant_lng }
      : { lat: order.delivery_lat, lng: order.delivery_lng };
    const geofenceError = await assertWithinGeofence({
      driverId: req.driverId,
      target: geofenceTarget,
      radiusMeters: config.geofence.defaultRadiusMeters,
      bodyLat: Number(req.body && req.body.lat),
      bodyLng: Number(req.body && req.body.lng),
    });
    if (geofenceError) return res.status(geofenceError.httpStatus).json(geofenceError.body);

    const nowIso = new Date().toISOString();
    const updatedOrder = await driverDispatchRepository.setDeliveryStatus({
      kind: V.key, orderId: order.id, expectedStatus: order.status, orderStatus: flow.orderStatus,
      deliveryId: delivery.id, driverId: req.driverId, deliveryStatus: flow.deliveryStatus,
      photoColumn: flow.photoColumn, photoPath, at: nowIso,
    });
    if (!updatedOrder) return res.status(409).json({ error: 'Order status changed — please refresh' });

    // Cash on delivery: handing the order over means the rider collected the
    // money — record the payment (idempotent inside markOrderPaid).
    if (
      flow.orderStatus === 'delivered' &&
      order.payment_method === 'cash' &&
      // 'awaiting', not '!== paid': the latter also matches 'refunded', and
      // the cash-once unique index is partial on status='paid', so a refunded
      // order would accept a second cash row and flip back to paid.
      order.payment_status === 'awaiting'
    ) {
      await V.markPaid(
        { ...order, status: flow.orderStatus },
        { provider: 'cash', raw: { cash_collected_by: req.driverId }, actorId: req.driverId }
      );

      // The rider is now holding OUR money. Rides have always booked this
      // receivable; food and shop never did, so a rider could run unlimited
      // COD orders with a zero balance and no cap.
      //
      // They owe our markup, the VAT, and our share of the delivery fee --
      // but NOT their own share of it, which they have just earned and are
      // already holding. VAT is in there because it is our liability to
      // ZATCA, not the rider's to keep.
      //
      // driver_fee is read off the ROW, not recomputed from config: a rider
      // carrying a balance from last week must not have it restated when the
      // split is repriced. Summed from parts rather than derived from
      // `total` for the same reason -- `total` cannot tell us which side of
      // the delivery fee is whose.
      //
      // driver_cash_ledger.booking_id is a FK to bookings, so a food/shop
      // order cannot fill it -- the code goes in `note` until a migration
      // adds a vertical-neutral reference.
      const platformDeliveryShare = round2(
        Number(order.delivery_fee || 0) - Number(order.driver_fee || 0)
      );
      const owed = round2(
        Number(order.platform_margin_total || 0) +
          Number(order.vat_amount || 0) +
          platformDeliveryShare
      );
      await chargeDriverCashOwed({
        driverId: req.driverId,
        amount: owed,
        note: `Cash collected on ${order.order_code}`,
      });
    }

    logAudit({
      actorId: req.driverId,
      action: `driver_${V.key}_delivery_${req.body.status}`,
      resourceType: V.auditResource,
      resourceId: order.order_code,
      meta: { photo_path: photoPath },
    });
    V.pushStatus(order.order_code, { status: flow.orderStatus });
    pushMerchantFeed(order.merchant_id, 'order_update', { orderCode: order.order_code, status: flow.orderStatus });
    V.pingAdmin(order.order_code);
    logNotification({ userId: order.customer_id, type: V.notify[req.body.status], code: order.order_code });
    // A warm Thank You once the order is safely delivered (spec section 5).
    if (flow.orderStatus === 'delivered' && V.notify.thanks) {
      logNotification({ userId: order.customer_id, type: V.notify.thanks, code: order.order_code });
    }

    return res.json({ orderCode: order.order_code, status: flow.orderStatus });
  } catch (err) {
    console.error('updateDeliveryStatus error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = {
  listOffers,
  acceptOffer,
  declineOffer,
  listMyDeliveries,
  listOpenDeliveries,
  claimOpenDelivery,
  cancelDelivery,
  cancelRide,
  createDeliveryPhotoUrl,
  updateDeliveryStatus,
};
