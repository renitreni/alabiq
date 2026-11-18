// ---------------------------------------------------------------------
// Ecommerce — customer orders: checkout, payment, tracking, history
//   - checkout            : POST /api/shop/orders
//   - listOrders          : GET  /api/shop/orders
//   - getOrder            : GET  /api/shop/orders/:code
//   - updateOrderContact  : PATCH /api/shop/orders/:code/contact
//   - getPaymentInfo      : GET  /api/shop/orders/:code/pay
//   - createPayUploadUrl  : POST /api/shop/orders/:code/pay/signed-url
//   - recordPayment       : POST /api/shop/orders/:code/pay
//   - createCardCharge    : POST /api/shop/orders/:code/charge
//
// The Tap webhook is NOT here — one handler serves all three verticals at
// POST /api/payments/webhooks/tap (controllers/cardPaymentsController).
//
// HARD RULES enforced here (never client-side):
//   * money is recomputed from DB catalogue prices via lib/shopMoney.js —
//     any client-sent totals are ignored (the schema doesn't accept them)
//   * subtotal < 50 SAR         -> 422 { failure_reason: 'min_order' }
//   * outside the 15 km radius  -> 422 { failure_reason: 'outside_radius' }
//   * insufficient stock        -> 409 { failure_reason: 'out_of_stock' }
//   * only the gateway token / transaction id is stored, never card data
//   * platform_margin_total and per-line margins never leave this file
//
// THE ONE STRUCTURAL DIFFERENCE FROM FOOD: checkout is a single Postgres
// transaction (shop_place_order), not a sequence of writes. Stock, the
// order, its lines and the cart clear together or not at all.
// ---------------------------------------------------------------------
const database = require('../../lib/database/pool');
const { config } = require('../../lib/config');
const { chargeForOrder, respondToCharge } = require('../../lib/cardCharge');
const { confirmGatewayPayment } = require('../../lib/gatewayPaid');
const { haversineKm } = require('../../lib/geo');
const { travelEtaMinutes, deliveryEtaBand } = require('../../lib/eta');
const { latestDriverFix } = require('../../lib/tracking');
const { priceShopOrder, resolveUnitPricing } = require('../../lib/shopMoney');
const { getMaxDistanceKm, getStcPayEnabled } = require('../../lib/settings');
const { tapConfigured } = require('../../lib/tap');
const { placeShopOrder } = require('../../lib/stock');
const { logShopEvent } = require('../../lib/foodEvents');
const { logAudit } = require('../../lib/audit');
const { logNotification, notifyAdmins } = require('../../lib/notifications');
const { pushShopOrderStatus, pushMerchantFeed, pingShopAdmin } = require('../../lib/realtime');
const { buildProofPath, createProofUploadUrl } = require('../../lib/storage');

// Payment statuses from which the customer may still (re)submit payment.
const PAYABLE_STATUSES = ['awaiting', 'failed'];

// platform_margin_total is deliberately absent from this list. It is never
// selected on a customer path, so it cannot be leaked by a forgotten
// destructure downstream.
const ORDER_SELECT =
  'id, order_code, customer_id, merchant_id, status, subtotal, delivery_fee, delivery_surcharge, ' +
  'vat_amount, vat_rate, total, distance_km, delivery_address, delivery_lat, delivery_lng, ' +
  'delivery_street, delivery_building, ' +
  'contact_phone, payment_status, payment_method, created_at, accepted_at, packed_at, ' +
  'ready_at, delivered_at, reject_reason, cancelled_by, cancelled_at';
const ORDER_SELECT_O = ORDER_SELECT.split(',').map((column) => `o.${column.trim()}`).join(', ');

// Terminal states — nothing left to estimate, and no Routes call worth
// spending on a dead page. Mirrors food's getOrder.
const ETA_IRRELEVANT_STATUSES = ['delivered', 'cancelled', 'rejected'];

// Statuses during which the customer may still edit their contact number.
const CONTACT_EDITABLE_STATUSES = ['pending', 'accepted', 'packing', 'ready', 'out_for_delivery'];

async function loadOrder(orderCode) {
  const { rows } = await database.query(
    `SELECT ${ORDER_SELECT} FROM public.shop_orders WHERE order_code=$1 LIMIT 1`, [orderCode]);
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

    const { rows: stores } = await database.query(
      `SELECT id,name,vertical,is_active,status,accepting_orders,lat,lng,owner_id
       FROM public.merchants WHERE id=$1 LIMIT 1`, [b.merchant_id]);
    const store = stores[0];
    if (!store || store.vertical !== 'shop' || !store.is_active || store.status !== 'active') {
      return res.status(409).json({
        error: 'This store is not accepting orders right now',
        failure_reason: 'store_unavailable',
      });
    }
    // Outside opening hours, or shut manually. Checked server-side because
    // the disabled button on the storefront is presentation, not a control.
    const openState = await merchantOpenState(store.id, store.accepting_orders);
    if (!openState.open) return res.status(409).json(CLOSED_RESPONSE);
    // A store with no map pin cannot take orders: the rider would have no
    // pickup point, and the radius check below would be skipped (distance
    // null), letting orders slip in from any distance.
    if (!Number.isFinite(store.lat) || !Number.isFinite(store.lng)) {
      return res.status(422).json({
        error: 'This store cannot take orders yet (location not set).',
        failure_reason: 'store_location_missing',
      });
    }

    const { rows: carts } = await database.query(
      'SELECT id FROM public.shop_carts WHERE customer_id=$1 AND merchant_id=$2 LIMIT 1', [req.userId,store.id]);
    const cart = carts[0] || null;
    const { rows: cartLines } = cart
      ? await database.query('SELECT product_id,variant_id,quantity FROM public.shop_cart_items WHERE cart_id=$1', [cart.id])
      : { rows: [] };
    if (!cartLines || cartLines.length === 0) {
      return res.status(422).json({ error: 'Your cart is empty', failure_reason: 'empty_cart' });
    }

    // Re-read the LIVE catalogue rows — prices and markups come from
    // here, not from the cart snapshot and certainly not from the client.
    const { rows: productRows } = await database.query(
      `SELECT p.id,p.merchant_id,p.name,p.price,p.net_price,p.is_available,p.track_stock,p.stock_quantity,
       COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM public.product_variants v WHERE v.product_id=p.id),'[]'::jsonb)
       AS product_variants FROM public.products p WHERE p.id=ANY($1::uuid[])`,
      [cartLines.map((l) => l.product_id)]);
    const productById = new Map(productRows.map((p) => [p.id, p]));

    const unavailable = [];
    const items = [];
    for (const line of cartLines) {
      const product = productById.get(line.product_id);
      // Cross-store lines cannot happen through the API, but a stale cart
      // after an admin moved a product would produce one.
      if (!product || product.merchant_id !== store.id || !product.is_available) {
        unavailable.push(product ? product.name : 'A product in your cart');
        continue;
      }
      const variant = line.variant_id
        ? (product.product_variants || []).find((v) => v.id === line.variant_id)
        : null;
      if (line.variant_id && (!variant || !variant.is_available)) {
        unavailable.push(product.name);
        continue;
      }
      const { unitPrice, netPrice } = resolveUnitPricing(product, variant);
      items.push({
        productId: product.id,
        variantId: variant ? variant.id : null,
        name: product.name,
        variantLabel: variant ? variant.label : null,
        sku: variant ? variant.sku : null,
        unitPrice,
        netPrice,
        quantity: line.quantity,
      });
    }

    if (unavailable.length) {
      return res.status(409).json({
        error: `No longer available: ${unavailable.join(', ')}. Please update your cart.`,
        failure_reason: 'items_unavailable',
        items: unavailable,
      });
    }
    if (!items.length) {
      return res.status(422).json({ error: 'Your cart is empty', failure_reason: 'empty_cart' });
    }

    // Money. Server-side, from the rows just read.
    const distanceKm =
      Number.isFinite(b.delivery_lat) && Number.isFinite(b.delivery_lng)
        ? haversineKm({ lat: store.lat, lng: store.lng }, { lat: b.delivery_lat, lng: b.delivery_lng })
        : null;

    const priced = priceShopOrder({ items, distanceKm, maxRadiusKm: await getMaxDistanceKm() });
    if (!priced.ok) {
      logShopEvent({
        eventName: 'checkout_attempt',
        userId: req.userId,
        merchantId: store.id,
        params: { order_total: priced.subtotal ?? null, failure_reason: priced.failureReason },
      });
      const message =
        priced.failureReason === 'min_order'
          ? `Minimum order is SAR ${Number(priced.minOrder).toFixed(2)}. Add SAR ${Number(priced.shortfall).toFixed(2)} more.`
          : `This store delivers up to ${priced.maxRadiusKm} km. Your address is about ${priced.distanceKm} km away.`;
      return res.status(422).json({ error: message, failure_reason: priced.failureReason, ...priced });
    }

    // Place it. ONE transaction: reserve stock, insert the order, insert
    // the line snapshots, empty the cart. Nothing partial can survive.
    const placed = await placeShopOrder({
      order: {
        customer_id: req.userId,
        merchant_id: store.id,
        subtotal: priced.subtotal,
        // delivery_fee is base + surcharge; the surcharge is stored beside it
        // so a reprinted receipt can itemise the distance charge (0034).
        delivery_fee: priced.deliveryFee,
        delivery_surcharge: priced.deliverySurcharge,
        // The driver's cut of that fee, snapshotted with the rate that
        // produced it (0041). Mirrors the food insert; the RPC's column
        // list had to be replaced to carry it.
        driver_fee: priced.driverFee,
        driver_fee_rate: priced.driverFeeRate,
        platform_margin_total: priced.marginTotal,
        vat_amount: priced.vatAmount,
        vat_rate: priced.vatRate,
        total: priced.total,
        distance_km: distanceKm != null ? Math.round(distanceKm * 100) / 100 : '',
        delivery_address: b.delivery_address,
        delivery_lat: Number.isFinite(b.delivery_lat) ? b.delivery_lat : '',
        delivery_lng: Number.isFinite(b.delivery_lng) ? b.delivery_lng : '',
        delivery_street: b.delivery_street,
        delivery_building: b.delivery_building,
        contact_phone: b.contact_phone || '',
        payment_method: b.payment_method,
      },
      lines: priced.lines.map((l) => ({
        product_id: l.productId,
        variant_id: l.variantId || '',
        name_snapshot: l.name,
        variant_label_snapshot: l.variantLabel || '',
        sku_snapshot: l.sku || '',
        unit_price: l.unitPrice,
        quantity: l.quantity,
        line_total: l.lineTotal,
        margin_per_item: l.marginPerItem,
        margin_total: l.marginTotal,
      })),
    });

    if (!placed.ok) {
      if (placed.failureReason === 'out_of_stock') {
        logShopEvent({
          eventName: 'out_of_stock_block',
          userId: req.userId,
          merchantId: store.id,
          params: { product: placed.product, requested: placed.requested, available: placed.available },
        });
        const name = placed.product || 'A product in your cart';
        // The exact remaining count stays server-side. Returning it here
        // would hand back precisely what the 0029 grants withhold, and this
        // endpoint is trivially pollable. The customer gets a name and an
        // action; the count goes to the log for support.
        console.warn(
          `shop checkout out_of_stock: ${placed.product} requested=${placed.requested} available=${placed.available}`
        );
        return res.status(409).json({
          error:
            placed.available === 0
              ? `${name} just sold out. Please remove it from your cart.`
              : `There is not enough stock of ${name} left. Please lower the quantity.`,
          failure_reason: 'out_of_stock',
          product: placed.product,
        });
      }
      return res.status(500).json({ error: 'Could not place your order. Please try again.' });
    }

    logShopEvent({
      eventName: 'checkout_attempt',
      userId: req.userId,
      shopOrderId: placed.orderId,
      merchantId: store.id,
      params: { order_total: priced.total, failure_reason: null },
    });
    logAudit({
      actorId: req.userId,
      action: 'shop_order_placed',
      resourceType: 'shop_order',
      resourceId: placed.orderCode,
      meta: { merchant_id: store.id, total: priced.total, lines: priced.lines.length },
    });
    logNotification({ userId: req.userId, type: 'shop_order_placed', code: placed.orderCode });

    // Tell the store and the admin tab immediately.
    pushMerchantFeed(store.id, 'new_order', { orderCode: placed.orderCode, status: 'pending' });
    pingShopAdmin(placed.orderCode);
    if (store.owner_id) {
      logNotification({ userId: store.owner_id, type: 'shop_order_new', code: placed.orderCode });
    }
    notifyAdmins({ type: 'shop_order_new', code: placed.orderCode });

    return res.status(201).json({
      orderCode: placed.orderCode,
      status: 'pending',
      paymentStatus: 'awaiting',
      paymentMethod: b.payment_method,
      subtotal: priced.subtotal,
      deliveryFee: priced.deliveryFee,
      vatRate: priced.vatRate,
      vatAmount: priced.vatAmount,
      total: priced.total,
      distanceKm: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
    });
  } catch (err) {
    console.error('shop checkout error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- History and tracking ---------------------------------------------
async function listOrders(req, res) {
  try {
    const { rows: data } = await database.query(
      `SELECT ${ORDER_SELECT_O},jsonb_build_object('id',m.id,'name',m.name,'logo_url',m.logo_url) AS merchants
       FROM public.shop_orders o LEFT JOIN public.merchants m ON m.id=o.merchant_id
       WHERE o.customer_id=$1 ORDER BY o.created_at DESC LIMIT 100`, [req.userId]);
    return res.json({
      orders: (data || []).map(({ id, customer_id, ...o }) => o),
    });
  } catch (err) {
    console.error('shop listOrders error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function getOrder(req, res) {
  try {
    const order = await loadOrder(req.params.code);
    if (!assertOwner(req, res, order)) return undefined;

    const [{ rows: items }, { rows: stores }, { rows: deliveries }] = await Promise.all([
      database.query(`SELECT id,name_snapshot,variant_label_snapshot,sku_snapshot,unit_price,quantity,line_total
        FROM public.shop_order_items WHERE order_id=$1`, [order.id]),
      database.query('SELECT id,name,logo_url,address,lat,lng FROM public.merchants WHERE id=$1 LIMIT 1',
        [order.merchant_id]),
      database.query(`SELECT status,driver_id,picked_up_at,delivered_at FROM public.shop_deliveries
        WHERE order_id=$1 LIMIT 1`, [order.id]),
    ]);
    const store = stores[0] || null;
    const delivery = deliveries[0] || null;

    // The rider's contact details are released only once they are actually
    // carrying this order — not while the job is still being offered around.
    let rider = null;
    if (delivery && delivery.driver_id) {
      const { rows: profiles } = await database.query(
        'SELECT full_name,mobile_number,avatar_url FROM public.profiles WHERE id=$1 LIMIT 1', [delivery.driver_id]);
      const profile = profiles[0];
      if (profile) {
        rider = {
          name: profile.full_name,
          phone: profile.mobile_number,
          avatarUrl: profile.avatar_url,
          status: delivery.status,
          location: null,
          etaMinutes: null,
        };
        // Live pin + rough ETA, mirroring food's getOrder. This was missing
        // entirely, so ShopTrackPage had nothing to draw and the map looked
        // permanently frozen even while a rider was actively en route.
        //
        // Gated on the delivery being active for the same reason food is: a
        // past customer must not be able to keep polling a delivered order and
        // follow the rider around for the rest of their shift.
        if (['assigned', 'picked_up'].includes(delivery.status)) {
          const lastFix = await latestDriverFix(delivery.driver_id);
          if (lastFix) {
            rider.location = lastFix;
            // Real driving time. Before pickup the rider is heading to the
            // STORE, so route to the leg they are actually on — same rule as
            // food's getOrder.
            const legTarget =
              delivery.status === 'picked_up'
                ? { lat: order.delivery_lat, lng: order.delivery_lng }
                : { lat: store?.lat, lng: store?.lng };
            rider.etaMinutes = await travelEtaMinutes(lastFix, legTarget);
            rider.leg = delivery.status === 'picked_up' ? 'to_customer' : 'to_store';
          }
        }
      }
    }

    // Headline ETA for the tracking hero, floored for the packing stage.
    const etaOrigin =
      rider && rider.leg === 'to_customer' && rider.location
        ? rider.location
        : { lat: store?.lat, lng: store?.lng };
    const eta = ETA_IRRELEVANT_STATUSES.includes(order.status)
      ? { min: null, max: null, label: null }
      : deliveryEtaBand(
          await travelEtaMinutes(etaOrigin, { lat: order.delivery_lat, lng: order.delivery_lng })
        );

    let driverRating = null;
    if (order.status === 'delivered') {
      const { rows } = await database.query(
        'SELECT stars,comment FROM public.driver_ratings WHERE shop_order_id=$1 LIMIT 1', [order.id]);
      const rating = rows[0];
      if (rating) driverRating = rating;
    }

    const { id, customer_id, ...publicOrder } = order;
    return res.json({
      order: publicOrder,
      items: items || [],
      store: store || null,
      delivery: delivery ? { status: delivery.status } : null,
      rider,
      eta,
      driverRating,
    });
  } catch (err) {
    console.error('shop getOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function updateOrderContact(req, res) {
  try {
    const order = await loadOrder(req.params.code);
    if (!assertOwner(req, res, order)) return undefined;
    if (!CONTACT_EDITABLE_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: `This order is already ${order.status}` });
    }
    await database.query('UPDATE public.shop_orders SET contact_phone=$2 WHERE id=$1',
      [order.id,req.body.contact_phone]);
    return res.json({ orderCode: order.order_code, contactPhone: req.body.contact_phone });
  } catch (err) {
    console.error('shop updateOrderContact error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Payment: STC Pay (manual, live path) ------------------------------
async function getPaymentInfo(req, res) {
  try {
    const order = await loadOrder(req.params.code);
    if (!assertOwner(req, res, order)) return undefined;

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
        ? { number: config.stcPay.number, recipientName: config.stcPay.recipientName }
        : null,
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
    console.error('shop getPaymentInfo error:', err);
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

    // Same private payment-proofs bucket; the SH- order code keys the folder.
    const path = buildProofPath(order.order_code, file_name);
    const { token, signedUrl } = await createProofUploadUrl(path);

    return res.status(201).json({
      bucket: config.proofs.bucket,
      path,
      token,
      signedUrl,
      maxBytes: config.proofs.maxBytes,
      next: `/api/shop/orders/${order.order_code}/pay`,
    });
  } catch (err) {
    console.error('shop createPayUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

// Mark an order paid + record the confirmation. THE single funnel, shared by
// the test-mode auto-verify, the admin manual verify, the Tap webhook and
// cash-at-the-door. Every path stays idempotent because
// shop_order_payments.gateway_transaction_id is unique, and cash rows are
// deduped by uq_shop_order_payments_cash_once (migration 0029).
async function markShopOrderPaid(
  order,
  { provider, transactionId = null, raw = null, actorId = null, skipPaymentRow = false }
) {
  let paymentId = null;
  try {
    paymentId = await database.transaction(async (client) => {
      if (!skipPaymentRow) {
        const { rows } = await client.query(
          `INSERT INTO public.shop_order_payments(order_id,provider,amount,status,gateway_transaction_id,gateway_raw)
           VALUES($1,$2,$3,'paid',$4,$5) RETURNING id`,
          [order.id,provider,order.total,transactionId,raw]);
        paymentId = rows[0].id;
      }
      const { rows } = await client.query(
        `UPDATE public.shop_orders SET payment_status='paid',
         gateway_transaction_id=COALESCE($2,gateway_transaction_id) WHERE id=$1 RETURNING id`,
        [order.id,transactionId]);
      if (!rows[0]) throw new Error('Shop order not found while recording payment');
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
        `UPDATE public.shop_orders SET payment_status='paid',gateway_transaction_id=COALESCE($2,gateway_transaction_id)
         WHERE id=$1 AND payment_status='awaiting'`, [order.id,transactionId]);
      return { alreadyPaid: true };
    }
    console.error('markShopOrderPaid: payment transaction failed', order.order_code, payErr);
    throw payErr;
  }

  logShopEvent({
    eventName: 'payment_success',
    userId: order.customer_id,
    shopOrderId: order.id,
    merchantId: order.merchant_id,
    params: { transaction_id: transactionId, payment_method: provider, amount: Number(order.total) },
  });
  logAudit({
    actorId,
    action: 'shop_payment_confirmed',
    resourceType: 'shop_order',
    resourceId: order.order_code,
    meta: { provider, amount: Number(order.total) },
  });
  logNotification({
    userId: order.customer_id,
    type: 'shop_payment_confirmed',
    code: order.order_code,
  });

  pushShopOrderStatus(order.order_code, { paymentStatus: 'paid', status: order.status });
  pushMerchantFeed(order.merchant_id, 'payment_update', {
    orderCode: order.order_code,
    paymentStatus: 'paid',
  });
  pingShopAdmin(order.order_code);

  // If the store already accepted while payment was pending, the order is
  // now dispatchable — start the Grab-style rider cascade. Lazy require
  // avoids a load-time circular dependency (dispatch also touches orders).
  if (['accepted', 'packing', 'ready'].includes(order.status)) {
    const { startShopDispatch } = require('../../lib/dispatch');
    startShopDispatch(order.id);
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
    // Path traversal / cross-order guard: the storage key must sit under this
    // order's own folder, and it was issued by us in createPayUploadUrl.
    if (!String(b.path || '').startsWith(`${order.order_code}/`)) {
      return res.status(400).json({ error: 'Invalid upload path for this order' });
    }

    try {
      await database.query(`INSERT INTO public.shop_order_payments(order_id,provider,amount,status,proof_path)
        VALUES($1,$2,$3,'awaiting',$4)`, [order.id,order.payment_method,order.total,b.path]);
    } catch (insErr) {
      console.error('shop recordPayment insert error:', insErr);
      return res.status(500).json({ error: 'Could not record your payment' });
    }

    logAudit({
      actorId: req.userId,
      action: 'shop_payment_proof_uploaded',
      resourceType: 'shop_order',
      resourceId: order.order_code,
      meta: { path: b.path },
    });
    pingShopAdmin(order.order_code);
    notifyAdmins({ type: 'shop_payment_pending', code: order.order_code });

    // TEST MODE ONLY. Loudly flagged at boot and gated on an env flag that
    // must be false in production (handbook Part 13 §13.12).
    if (config.autoVerifyTestMode) {
      await markShopOrderPaid(order, {
        provider: order.payment_method,
        transactionId: `test-${order.order_code}`,
        raw: { auto_verified: true, path: b.path },
        actorId: req.userId,
      });
      return res.json({
        orderCode: order.order_code,
        paymentStatus: 'paid',
        autoVerified: true,
      });
    }

    return res.json({
      orderCode: order.order_code,
      paymentStatus: 'awaiting',
      message: 'Payment proof received. We will confirm your order shortly.',
    });
  } catch (err) {
    console.error('shop recordPayment error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Payment: card via Tap (new card, saved card, or Apple Pay) --------
//
// Shares lib/cardCharge.js with food and rides rather than carrying its own
// copy of the gateway logic, which is what the old stub here was waiting for.
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
    // one thing they must not do on a customer's behalf.
    if (order.customer_id !== req.userId) {
      return res.status(403).json({ error: 'A card payment can only be made by the customer' });
    }

    const result = await chargeForOrder({
      req,
      profile: req.profile,
      vertical: 'shop',
      code: order.order_code,
      amount: Number(order.total),
      redirectPath: `/shop/track/${order.order_code}`,
      savedMethodId: req.body.saved_method_id || null,
      saveCard: req.body.save_card === true,
    });

    if (result.kind === 'redirect' || result.kind === 'paid') {
      await database.query("UPDATE public.shop_orders SET payment_method='tap' WHERE id=$1", [order.id]);
    }

    return respondToCharge(res, result, order.order_code, async () => {
      await confirmGatewayPayment({
        vertical: 'shop',
        code: order.order_code,
        chargeId: result.chargeId,
        status: 'CAPTURED',
        amountPaid: result.charge && result.charge.amount,
        currency: result.charge && result.charge.currency,
      });
    }, 'shop');
  } catch (err) {
    console.error('shop createCardCharge error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// NOTE: the per-vertical Tap webhook that used to live here is gone. Two
// things were wrong with it. It HMAC'd JSON.stringify(body) while Tap signs
// a concatenation of named charge fields, so it could never have matched a
// real webhook; and it passed the ENTIRE webhook body as gateway_raw, which
// would have persisted the card object into shop_order_payments. Food
// already redacted that (raw: { status, id }). The replacement is one
// handler for all three verticals: POST /api/payments/webhooks/tap.

module.exports = {
  checkout,
  listOrders,
  getOrder,
  updateOrderContact,
  getPaymentInfo,
  createPayUploadUrl,
  recordPayment,
  createCardCharge,
  markShopOrderPaid,
  loadOrder,
  ORDER_SELECT,
};
