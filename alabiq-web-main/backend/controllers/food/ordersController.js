// ---------------------------------------------------------------------
// Food Delivery — customer orders: checkout, payment, tracking, history
//   - checkout            : POST /api/food/orders
//   - listOrders          : GET  /api/food/orders
//   - getOrder            : GET  /api/food/orders/:code
//   - getPaymentInfo      : GET  /api/food/orders/:code/pay
//   - createPayUploadUrl  : POST /api/food/orders/:code/pay/signed-url
//   - recordPayment       : POST /api/food/orders/:code/pay
//   - createCardCharge    : POST /api/food/orders/:code/charge
//
// The Tap webhook is NOT here — one handler serves all three verticals at
// POST /api/payments/webhooks/tap (controllers/cardPaymentsController).
//
// HARD RULES enforced here (never client-side):
//   * money is recomputed from DB menu prices via lib/foodMoney.js —
//     any client-sent totals are ignored (the schema doesn't accept them)
//   * subtotal < 30 SAR  -> 422 { failure_reason: 'min_order' }
//   * outside the 15 km radius -> 422 { failure_reason: 'outside_radius' }
//   * only the gateway token / transaction id is stored, never card data
// ---------------------------------------------------------------------
const database = require('../../lib/database/pool');
const { config } = require('../../lib/config');
const { chargeForOrder, respondToCharge } = require('../../lib/cardCharge');
const { confirmGatewayPayment } = require('../../lib/gatewayPaid');
const { haversineKm } = require('../../lib/geo');
const { travelEtaMinutes, deliveryEtaBand } = require('../../lib/eta');
const { latestDriverFix } = require('../../lib/tracking');
const { priceOrder } = require('../../lib/foodMoney');
const { getMaxDistanceKm, getStcPayEnabled } = require('../../lib/settings');
const { tapConfigured } = require('../../lib/tap');
const { merchantOpenState, CLOSED_RESPONSE } = require('../../lib/storeHours');
const { findSizeOption } = require('../../lib/foodSizes');
const { logFoodEvent } = require('../../lib/foodEvents');
const { logAudit } = require('../../lib/audit');
const { logNotification, notifyAdmins } = require('../../lib/notifications');
const { pushFoodOrderStatus, pushMerchantFeed, pingFoodAdmin } = require('../../lib/realtime');
const { buildProofPath, createProofUploadUrl } = require('../../lib/storage');

// Payment statuses from which the customer may still (re)submit payment.
const PAYABLE_STATUSES = ['awaiting', 'failed'];

const ORDER_SELECT =
  'id, order_code, customer_id, merchant_id, status, subtotal, delivery_fee, delivery_surcharge, ' +
  'platform_margin_total, vat_amount, vat_rate, total, distance_km, delivery_address, delivery_lat, delivery_lng, ' +
  'delivery_street, delivery_building, ' +
  'contact_phone, payment_status, payment_method, created_at, accepted_at, ready_at, delivered_at, ' +
  'reject_reason, cancelled_by, cancelled_at';
const ORDER_SELECT_O = ORDER_SELECT.split(',').map((column) => `o.${column.trim()}`).join(', ');

// Statuses during which the customer may still edit their contact number.
const CONTACT_EDITABLE_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'];

// Terminal states: the order is over, so there is nothing left to estimate.
// Quoting an ETA on a delivered or cancelled order would be noise, and it
// would also spend a Google Routes call on every poll of a dead page.
const ETA_IRRELEVANT_STATUSES = ['delivered', 'cancelled', 'rejected'];

async function loadOrder(orderCode) {
  const { rows } = await database.query(
    `SELECT ${ORDER_SELECT} FROM public.orders WHERE order_code=$1 LIMIT 1`, [orderCode]);
  return rows[0] || null;
}

// The caller must own the order (admins pass for support).
function assertOwner(req, res, order) {
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return false;
  }
  if (order.customer_id !== req.userId && req.role !== 'admin') {
    res.status(403).json({ error: 'This order belongs to another account' });
    return false;
  }
  return true;
}

// --- Checkout --------------------------------------------------------
async function checkout(req, res) {
  try {
    const b = req.body; // validated by the route schema

    // Card at order creation used to be refused outright by the route enum,
    // because an order must never be created against a gateway that might be
    // unconfigured. That invariant still holds - it is checked explicitly
    // here now, rather than by refusing the method for everyone. The picker
    // only offers card when GET /api/payments/config says it is live, so
    // reaching this means a stale client or a key rotated out mid-session.
    if (b.payment_method === 'tap' && !tapConfigured()) {
      return res.status(400).json({ error: 'Card payment is not available right now' });
    }

    const { rows: merchantRows } = await database.query(
      `SELECT id,name,vertical,is_active,status,accepting_orders,lat,lng,service_radius_km,owner_id
       FROM public.merchants WHERE id=$1 LIMIT 1`, [b.merchant_id]);
    const merchant = merchantRows[0];
    // merchants is shared with the Ecommerce vertical (0026). Without the
    // vertical check a caller could pass a STORE id to food checkout: the
    // cart lookup would find nothing and it would fail as "empty cart", but
    // the failure would be confusing rather than correct.
    if (!merchant || merchant.vertical !== 'food' || !merchant.is_active || merchant.status !== 'active') {
      return res.status(409).json({
        error: 'This restaurant is not accepting orders right now',
        failure_reason: 'restaurant_unavailable',
      });
    }
    // Outside opening hours, or shut manually. Checked server-side because
    // the disabled button on the storefront is presentation, not a control.
    const openState = await merchantOpenState(merchant.id, merchant.accepting_orders);
    if (!openState.open) {
      return res.status(409).json({ ...CLOSED_RESPONSE, error: 'This restaurant is closed right now' });
    }
    // A restaurant with no map pin cannot take orders: the driver would have
    // no pickup point and the 15 km radius check below would be skipped
    // (distance is null), letting orders slip in from any distance. New
    // restaurants can no longer be listed unpinned, so this only guards
    // legacy rows until an admin re-pins them.
    if (!Number.isFinite(merchant.lat) || !Number.isFinite(merchant.lng)) {
      return res.status(422).json({
        error: 'This restaurant cannot take orders yet (location not set).',
        failure_reason: 'restaurant_location_missing',
      });
    }

    const { rows: carts } = await database.query(
      'SELECT id FROM public.carts WHERE customer_id=$1 AND merchant_id=$2 LIMIT 1', [req.userId,merchant.id]);
    const cart = carts[0] || null;
    const { rows: cartLines } = cart
      ? await database.query('SELECT menu_item_id,quantity,size FROM public.cart_items WHERE cart_id=$1', [cart.id])
      : { rows: [] };
    if (!cartLines || cartLines.length === 0) {
      return res.status(422).json({ error: 'Your cart is empty', failure_reason: 'empty_cart' });
    }

    // Re-read the LIVE menu rows — prices/margins come from here, not
    // from the cart snapshot and certainly not from the client.
    const { rows: menuRows } = await database.query(
      `SELECT id,name,price,net_price,item_type,is_available,merchant_id,size_options
       FROM public.menu_items WHERE id=ANY($1::uuid[])`, [cartLines.map((l) => l.menu_item_id)]);
    const menuById = new Map(menuRows.map((m) => [m.id, m]));

    const unavailable = [];
    const items = [];
    for (const line of cartLines) {
      const menu = menuById.get(line.menu_item_id);
      // A sized cart line must still map to an ENABLED size option — if the
      // admin disabled/removed that size since it was added, treat the line
      // as unavailable rather than silently charging the wrong price.
      const sizeOption = menu && line.size ? findSizeOption(menu.size_options, line.size) : null;
      if (!menu || !menu.is_available || menu.merchant_id !== merchant.id || (line.size && !sizeOption)) {
        unavailable.push(menu ? menu.name : 'a removed item');
      } else {
        items.push({
          menuItemId: menu.id,
          name: menu.name,
          size: sizeOption ? sizeOption.id : null,
          sizeLabel: sizeOption ? sizeOption.label : null,
          unitPrice: sizeOption ? Number(sizeOption.price) : Number(menu.price),
          netPrice: menu.net_price == null ? null : Number(menu.net_price),
          quantity: line.quantity,
          itemType: menu.item_type,
        });
      }
    }
    if (unavailable.length) {
      return res.status(409).json({
        error: `Some items are no longer available: ${unavailable.join(', ')}. Please update your cart.`,
        failure_reason: 'item_unavailable',
        items: unavailable,
      });
    }

    // Distance for the delivery-fee rule (merchant -> customer): flat fee
    // inside the free radius, + per-km surcharge beyond it, refused past
    // the max. Null when the restaurant has no pin yet — the flat promo
    // fee applies with no surcharge.
    const distanceKm = haversineKm(
      { lat: merchant.lat, lng: merchant.lng },
      { lat: b.delivery_lat, lng: b.delivery_lng }
    );

    // THE money math — single source of truth.
    const priced = priceOrder({ items, distanceKm, maxRadiusKm: await getMaxDistanceKm() });
    if (!priced.ok) {
      logFoodEvent({
        eventName: 'checkout_attempt',
        userId: req.userId,
        merchantId: merchant.id,
        params: { order_total: priced.subtotal ?? null, failure_reason: priced.failureReason },
      });
      const message =
        priced.failureReason === 'min_order'
          ? `Minimum order is SAR ${priced.minOrder.toFixed(2)}. Add SAR ${priced.shortfall.toFixed(2)} more to check out.`
          : `This address is ${priced.distanceKm} km away — beyond our ${priced.maxRadiusKm} km delivery limit.`;
      return res.status(422).json({ error: message, failure_reason: priced.failureReason, ...priced });
    }

    // Create the order (order_code comes from gen_order_code()).
    const order = await database.transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO public.orders(customer_id,merchant_id,subtotal,delivery_fee,delivery_surcharge,
         driver_fee,driver_fee_rate,platform_margin_total,vat_amount,vat_rate,total,distance_km,
         delivery_address,delivery_lat,delivery_lng,delivery_street,delivery_building,contact_phone,payment_method)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING ${ORDER_SELECT}`,
        [req.userId,merchant.id,priced.subtotal,priced.deliveryFee,priced.deliverySurcharge,
          priced.driverFee,priced.driverFeeRate,priced.marginTotal,priced.vatAmount,priced.vatRate,
          priced.total,distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
          b.delivery_address,b.delivery_lat ?? null,b.delivery_lng ?? null,b.delivery_street,
          b.delivery_building,b.contact_phone || null,b.payment_method || 'stcpay'],
      );
      const created = rows[0];
      for (const line of priced.lines) {
        await client.query(
          `INSERT INTO public.order_items(order_id,menu_item_id,name_snapshot,size_snapshot,unit_price,
           quantity,line_total,margin_per_item,margin_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [created.id,line.menuItemId,line.name,line.sizeLabel || null,line.unitPrice,line.quantity,
            line.lineTotal,line.marginPerItem,line.marginTotal],
        );
      }
      if (cart) await client.query('DELETE FROM public.carts WHERE id=$1', [cart.id]);
      return created;
    });

    logFoodEvent({
      eventName: 'checkout_attempt',
      userId: req.userId,
      orderId: order.id,
      merchantId: merchant.id,
      params: { order_total: priced.total },
    });
    logAudit({
      actorId: req.userId,
      action: 'food_order_created',
      resourceType: 'order',
      resourceId: order.order_code,
      meta: { merchant_id: merchant.id, total: priced.total },
    });
    pushMerchantFeed(merchant.id, 'new_order', {
      orderCode: order.order_code,
      status: order.status,
      paymentStatus: order.payment_status,
      total: order.total,
    });
    pingFoodAdmin(order.order_code);

    const creationAlerts = [
      logNotification({
        userId: req.userId,
        orderId: order.id,
        type: 'food_order_placed',
        code: order.order_code,
        title: 'Food order placed',
        body: `Your order from ${merchant.name} was created successfully.`,
        url: `/food/track/${order.order_code}`,
      }),
      notifyAdmins({
        orderId: order.id,
        type: 'admin_food_order_created',
        code: order.order_code,
        url: '/admin',
      }),
    ];
    if (merchant.owner_id) {
      creationAlerts.push(
        logNotification({
          userId: merchant.owner_id,
          orderId: order.id,
          type: 'merchant_food_order_created',
          code: order.order_code,
          title: 'New restaurant order',
          body: `A customer placed order ${order.order_code}.`,
          url: '/merchant',
        })
      );
    }
    await Promise.all(creationAlerts);

    return res.status(201).json({
      orderCode: order.order_code,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      subtotal: order.subtotal,
      deliveryFee: order.delivery_fee,
      total: order.total,
      distanceKm: order.distance_km,
      next: `/api/food/orders/${order.order_code}/pay`,
    });
  } catch (err) {
    console.error('checkout error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// PATCH /api/food/orders/:code/contact — the customer may fix their contact
// number even while the order is IN PROGRESS (out for delivery); the rider
// and admin views pick it up via broadcast + their normal refresh.
async function updateOrderContact(req, res) {
  try {
    const order = await loadOrder(req.params.code);
    if (!assertOwner(req, res, order)) return undefined;
    if (!CONTACT_EDITABLE_STATUSES.includes(order.status)) {
      return res.status(409).json({
        error: `The contact number can no longer be changed (order is ${order.status})`,
      });
    }

    const contactPhone = (req.body.contact_phone || '').trim();
    if (!contactPhone) return res.status(400).json({ error: 'contact_phone is required' });

    await database.query('UPDATE public.orders SET contact_phone=$2 WHERE id=$1', [order.id,contactPhone]);

    logAudit({
      actorId: req.userId,
      action: 'food_order_contact_updated',
      resourceType: 'order',
      resourceId: order.order_code,
    });
    pushFoodOrderStatus(order.order_code, { contactPhone });
    pingFoodAdmin(order.order_code);

    return res.json({ orderCode: order.order_code, contactPhone });
  } catch (err) {
    console.error('updateOrderContact error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- History + tracking ----------------------------------------------
async function listOrders(req, res) {
  try {
    const { rows: data } = await database.query(
      `SELECT ${ORDER_SELECT_O},jsonb_build_object('id',m.id,'name',m.name,'logo_url',m.logo_url,
       'cuisine_type',m.cuisine_type) AS merchants FROM public.orders o
       LEFT JOIN public.merchants m ON m.id=o.merchant_id
       WHERE o.customer_id=$1 ORDER BY o.created_at DESC LIMIT 50`, [req.userId]);
    return res.json({
      // platform_margin_total stays internal: with variable markup it would
      // let the customer derive the restaurant's confidential net price.
      orders: (data || []).map(({ id, customer_id, platform_margin_total, ...order }) => order),
    });
  } catch (err) {
    console.error('listOrders error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function getOrder(req, res) {
  try {
    const order = await loadOrder(req.params.code);
    if (!assertOwner(req, res, order)) return undefined;

    const [{ rows: items }, { rows: merchantRows }, { rows: deliveryRows }] = await Promise.all([
      database.query(`SELECT name_snapshot,size_snapshot,unit_price,quantity,line_total
        FROM public.order_items WHERE order_id=$1`, [order.id]),
      database.query(`SELECT id,name,logo_url,cuisine_type,address,lat,lng
        FROM public.merchants WHERE id=$1 LIMIT 1`, [order.merchant_id]),
      database.query(`SELECT d.status,d.driver_id,CASE WHEN p.id IS NULL THEN NULL ELSE
        jsonb_build_object('full_name',p.full_name,'whatsapp_number',p.whatsapp_number,
        'mobile_number',p.mobile_number) END AS profiles FROM public.deliveries d
        LEFT JOIN public.profiles p ON p.id=d.driver_id WHERE d.order_id=$1 LIMIT 1`, [order.id]),
    ]);
    const merchant = merchantRows[0] || null;
    const delivery = deliveryRows[0] || null;

    let rider = null;
    if (delivery && delivery.profiles) {
      rider = {
        name: delivery.profiles.full_name,
        whatsapp: delivery.profiles.whatsapp_number,
        mobile: delivery.profiles.mobile_number,
        status: delivery.status,
        location: null,
        etaMinutes: null,
      };
      // Live pin: the rider's most recent GPS fix (their device pings every
      // ~4s while online) + a rough ETA to the drop-off point. Only while
      // the delivery is actually active — otherwise a past customer could
      // keep polling this endpoint and track the rider's live position long
      // after their own order was delivered (mirrors the ride-tracking gate
      // in trackingController.js's ACTIVE_RIDE_STATUSES).
      //
      // latestDriverFix also drops a fix that is simply too old to trust, so
      // a rider who went offline mid-delivery stops rendering rather than
      // freezing on the map pretending to still be en route.
      if (['assigned', 'picked_up'].includes(delivery.status)) {
        const lastFix = await latestDriverFix(delivery.driver_id);
        if (lastFix) {
          rider.location = lastFix;
          // Real driving time, not haversine-over-30km/h. Before pickup the
          // rider is still heading to the RESTAURANT, so an ETA measured to
          // the customer's door would be nonsense while they drive the other
          // way — route to whichever leg they are actually on.
          const legTarget =
            delivery.status === 'picked_up'
              ? { lat: order.delivery_lat, lng: order.delivery_lng }
              : { lat: merchant?.lat, lng: merchant?.lng };
          rider.etaMinutes = await travelEtaMinutes(lastFix, legTarget);
          rider.leg = delivery.status === 'picked_up' ? 'to_customer' : 'to_restaurant';
        }
      }
    }

    // Headline ETA for the tracking hero, floored for the kitchen stage.
    // Once the rider has the food their live ETA is the honest number and
    // takes over; before that we measure the restaurant -> customer leg,
    // which is the part of the journey that has not started yet.
    const etaOrigin =
      rider && rider.leg === 'to_customer' && rider.location
        ? rider.location
        : { lat: merchant?.lat, lng: merchant?.lng };
    const eta = ETA_IRRELEVANT_STATUSES.includes(order.status)
      ? { min: null, max: null, label: null }
      : deliveryEtaBand(
          await travelEtaMinutes(etaOrigin, { lat: order.delivery_lat, lng: order.delivery_lng })
        );

    // Has this customer already rated the rider? (drives the stars widget)
    let driverRating = null;
    if (order.status === 'delivered') {
      const { rows } = await database.query(
        'SELECT stars,comment FROM public.driver_ratings WHERE order_id=$1 LIMIT 1', [order.id]);
      const rating = rows[0];
      if (rating) driverRating = rating;
    }

    // platform_margin_total stays internal (net-price confidentiality).
    const { id, customer_id, platform_margin_total, ...publicOrder } = order;
    return res.json({ order: publicOrder, items: items || [], merchant: merchant || null, rider, eta, driverRating });
  } catch (err) {
    console.error('getOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Payment: STC Pay (manual, live path) ------------------------------
async function getPaymentInfo(req, res) {
  try {
    const order = await loadOrder(req.params.code);
    if (!assertOwner(req, res, order)) return undefined;

    // Cash on delivery: nothing to pay online — the rider collects.
    if (order.payment_method === 'cash') {
      return res.json({
        orderCode: order.order_code,
        paymentStatus: order.payment_status,
        paymentMethod: 'cash',
        amount: order.total,
        currency: 'SAR',
        instructions: [
          `Pay SAR ${Number(order.total).toFixed(2)} in cash to your rider when the order arrives.`,
        ],
      });
    }

    const stcPayAvailable = await getStcPayEnabled();

    return res.json({
      orderCode: order.order_code,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      amount: order.total,
      currency: 'SAR',
      // See the note in controllers/paymentsController.js - one switch (0044).
      stcPayAvailable,
      stcPay: stcPayAvailable
        ? {
            number: config.stcPay.number,
            recipientName: config.stcPay.recipientName,
          }
        : null,
      // The order code IS the transfer note so payments can be matched.
      reference: order.order_code,
      // Whether to offer the card option at all. Only the PUBLIC key is
      // ever sent — the secret is what gates availability server-side.
      cardAvailable: !!config.tap.secretKey,
      tapPublicKey: config.tap.publicKey || null,
      applePayEnabled: !!config.tap.applePayEnabled,
      instructions: stcPayAvailable
        ? [
            `Open STC Pay and send SAR ${Number(order.total).toFixed(2)} to ${config.stcPay.number} (${config.stcPay.recipientName}).`,
            `Put your order code ${order.order_code} in the transfer note.`,
            'Take a screenshot of the successful transfer.',
            'Upload that screenshot below to confirm your order.',
          ]
        : [],
      testMode: config.autoVerifyTestMode,
    });
  } catch (err) {
    console.error('getPaymentInfo error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function createPayUploadUrl(req, res) {
  try {
    const order = await loadOrder(req.params.code);
    if (!assertOwner(req, res, order)) return undefined;
    if (order.payment_method === 'cash') {
      return res.status(409).json({ error: 'This order is cash on delivery — pay the rider directly' });
    }
    if (!PAYABLE_STATUSES.includes(order.payment_status)) {
      return res.status(409).json({
        error: `Payment is already ${order.payment_status}; a new proof cannot be uploaded`,
      });
    }

    const { file_name, mime_type } = req.body;
    if (!mime_type || !config.proofs.allowedMimeTypes.includes(mime_type)) {
      return res.status(400).json({
        error: `mime_type is required and must be one of: ${config.proofs.allowedMimeTypes.join(', ')}`,
      });
    }

    // Same private payment-proofs bucket as Pick & Drop; FD- prefix keys it.
    const path = buildProofPath(order.order_code, file_name);
    const { token, signedUrl } = await createProofUploadUrl(path);

    return res.status(201).json({
      bucket: config.proofs.bucket,
      path,
      token,
      signedUrl,
      maxBytes: config.proofs.maxBytes,
      next: `/api/food/orders/${order.order_code}/pay`,
    });
  } catch (err) {
    console.error('createPayUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

// Mark an order paid + record the confirmation. Shared by the test-mode
// auto-verify, the admin manual verify, and the Tap webhook — all paths
// stay idempotent because order_payments.gateway_transaction_id is unique.
async function markOrderPaid(order, { provider, transactionId = null, raw = null, actorId = null, skipPaymentRow = false }) {
  // skipPaymentRow: the caller already has a paid order_payments row (admin
  // verify promotes the awaiting proof row) — don't insert a duplicate.
  let paymentId = null;
  try {
    paymentId = await database.transaction(async (client) => {
      if (!skipPaymentRow) {
        const { rows } = await client.query(
          `INSERT INTO public.order_payments(order_id,provider,amount,status,gateway_transaction_id,gateway_raw)
           VALUES($1,$2,$3,'paid',$4,$5) RETURNING id`,
          [order.id,provider,order.total,transactionId,raw]);
        paymentId = rows[0].id;
      }
      const { rows } = await client.query(
        `UPDATE public.orders SET payment_status='paid',
         gateway_transaction_id=COALESCE($2,gateway_transaction_id) WHERE id=$1 RETURNING id`,
        [order.id,transactionId]);
      if (!rows[0]) throw new Error('Order not found while recording payment');
      return paymentId;
    });
  } catch (payErr) {
    if (!skipPaymentRow && payErr.code === '23505') {
      // 23505 = unique violation on gateway_transaction_id: the payment row
      // already exists. That does NOT mean the order caught up -- if the
      // process died between these two writes, the row is there and the
      // order is still 'awaiting'. Returning here made every one of Tap's
      // redeliveries take this same early exit, so the customer stayed
      // charged for an order nobody could see, forever. Re-run the order
      // update instead; it is idempotent and CAS-guarded on 'awaiting'.
      await database.query(
        `UPDATE public.orders SET payment_status='paid',gateway_transaction_id=COALESCE($2,gateway_transaction_id)
         WHERE id=$1 AND payment_status='awaiting'`, [order.id,transactionId]);
      return { alreadyPaid: true };
    }
    console.error('markOrderPaid: payment transaction failed', order.order_code, payErr);
    throw payErr;
  }

  logFoodEvent({
    eventName: 'payment_success',
    userId: order.customer_id,
    orderId: order.id,
    merchantId: order.merchant_id,
    params: { transaction_id: transactionId, payment_method: provider, amount: Number(order.total) },
  });
  logAudit({
    actorId,
    action: 'food_payment_confirmed',
    resourceType: 'order',
    resourceId: order.order_code,
    meta: { provider, amount: Number(order.total) },
  });
  logNotification({ userId: order.customer_id, type: 'food_payment_confirmed', code: order.order_code });

  pushFoodOrderStatus(order.order_code, { paymentStatus: 'paid', status: order.status });
  pushMerchantFeed(order.merchant_id, 'payment_update', {
    orderCode: order.order_code,
    paymentStatus: 'paid',
  });
  pingFoodAdmin(order.order_code);

  // If the merchant already accepted while payment was pending, the order is
  // now dispatchable — start the Grab-style rider cascade.
  if (['accepted', 'preparing', 'ready'].includes(order.status)) {
    const { startFoodDispatch } = require('../../lib/dispatch');
    startFoodDispatch(order.id);
  }
  return { paymentId };
}

async function recordPayment(req, res) {
  try {
    const order = await loadOrder(req.params.code);
    if (!assertOwner(req, res, order)) return undefined;
    if (order.payment_method === 'cash') {
      return res.status(409).json({ error: 'This order is cash on delivery — pay the rider directly' });
    }
    if (!PAYABLE_STATUSES.includes(order.payment_status)) {
      return res.status(409).json({
        error: `Payment is already ${order.payment_status}; a new proof cannot be recorded`,
      });
    }

    const b = req.body;
    if (!String(b.path || '').startsWith(`${order.order_code}/`)) {
      return res.status(400).json({
        error: 'Validation failed',
        details: ['path does not belong to this order'],
      });
    }
    if (b.size_bytes != null && Number(b.size_bytes) > config.proofs.maxBytes) {
      return res.status(400).json({
        error: 'Validation failed',
        details: [`file exceeds max size of ${config.proofs.maxBytes} bytes`],
      });
    }

    // TEST MODE ONLY: skip admin review and confirm instantly.
    if (config.autoVerifyTestMode) {
      await markOrderPaid(order, {
        provider: 'stcpay',
        transactionId: b.reference || null,
        raw: { proof_path: b.path, test_auto: true },
        actorId: req.userId,
      });
      return res.status(201).json({
        orderCode: order.order_code,
        paymentStatus: 'paid',
        autoVerified: true,
      });
    }

    // Normal flow: record the proof, keep 'awaiting' until an admin verifies.
    try {
      await database.query(`INSERT INTO public.order_payments
        (order_id,provider,amount,status,gateway_transaction_id,gateway_raw)
        VALUES($1,'stcpay',$2,'awaiting',$3,$4)`, [order.id,order.total,b.reference || null,{
        proof_path: b.path,
        file_name: b.file_name || null,
        mime_type: b.mime_type || null,
        size_bytes: b.size_bytes || null,
      }]);
    } catch (payErr) {
      if (payErr.code === '23505') {
        return res.status(409).json({ error: 'This payment reference was already submitted' });
      }
      console.error('recordPayment insert error:', payErr);
      return res.status(500).json({ error: 'Could not record the payment' });
    }

    logAudit({
      actorId: req.userId,
      action: 'food_payment_proof_uploaded',
      resourceType: 'order',
      resourceId: order.order_code,
    });
    pushMerchantFeed(order.merchant_id, 'payment_update', {
      orderCode: order.order_code,
      paymentStatus: 'awaiting',
    });
    pingFoodAdmin(order.order_code);

    return res.status(201).json({
      orderCode: order.order_code,
      paymentStatus: 'awaiting',
      autoVerified: false,
      message: 'Payment proof received. Your order will be confirmed once the payment is verified.',
    });
  } catch (err) {
    console.error('recordPayment error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Payment: card via Tap (new card, saved card, or Apple Pay) --------
//
// The decision tree (which of Tap's save-card scenarios applies) lives in
// lib/cardCharge.js so all three verticals behave identically. This handler
// only loads the order, authorizes it, and maps the result onto HTTP.
async function createCardCharge(req, res) {
  try {
    const order = await loadOrder(req.params.code);
    if (!assertOwner(req, res, order)) return undefined;
    if (order.payment_method === 'cash') {
      return res.status(409).json({ error: 'This order is cash on delivery — pay the rider directly' });
    }
    if (!PAYABLE_STATUSES.includes(order.payment_status)) {
      return res.status(409).json({ error: `Payment is already ${order.payment_status}` });
    }
    // assertOwner lets admins through for support. Charging a card is the
    // one thing they must not do on someone else's behalf, so the card path
    // requires the real owner even when the caller is an admin.
    if (order.customer_id !== req.userId) {
      return res.status(403).json({ error: 'A card payment can only be made by the customer' });
    }

    const result = await chargeForOrder({
      req,
      profile: req.profile,
      vertical: 'food',
      code: order.order_code,
      amount: Number(order.total),
      redirectPath: `/food/track/${order.order_code}`,
      savedMethodId: req.body.saved_method_id || null,
      saveCard: req.body.save_card === true,
    });

    // Only claim the order for card once the gateway has accepted it.
    if (result.kind === 'redirect' || result.kind === 'paid') {
      await database.query("UPDATE public.orders SET payment_method='tap' WHERE id=$1", [order.id]);
    }

    return respondToCharge(res, result, order.order_code, async () => {
      await confirmGatewayPayment({
        vertical: 'food',
        code: order.order_code,
        chargeId: result.chargeId,
        status: 'CAPTURED',
        amountPaid: result.charge && result.charge.amount,
        currency: result.charge && result.charge.currency,
      });
    }, 'food');
  } catch (err) {
    console.error('createCardCharge error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// NOTE: the per-vertical Tap webhook that used to live here is gone. It
// HMAC'd JSON.stringify(body), but Tap signs a concatenation of named
// charge fields keyed with the secret API key, so it could never have
// matched a real webhook. There is now one correct handler for all three
// verticals: POST /api/payments/webhooks/tap (controllers/cardPaymentsController).

module.exports = {
  checkout,
  listOrders,
  getOrder,
  getPaymentInfo,
  createPayUploadUrl,
  recordPayment,
  createCardCharge,
  markOrderPaid,
  updateOrderContact,
  loadOrder,
  PAYABLE_STATUSES,
};
