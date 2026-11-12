// ---------------------------------------------------------------------
// Food order actions — accept / reject / advance status.
//
// Shared core for BOTH the admin fallback (adminFoodController.js, for
// restaurants without their own logged-in device yet) and the merchant's
// own dashboard (merchantOrdersController.js, the primary path). Money-
// sensitive logic (credit gating, platform margin charge, the ledger) lives
// here exactly once so the two callers can never diverge.
//
// Each function returns { httpStatus, body } instead of writing to `res` —
// callers just do res.status(httpStatus).json(body).
// ---------------------------------------------------------------------
const database = require('./database/pool');
const { config } = require('./config');
const { round2 } = require('./foodMoney');
const { logFoodEvent } = require('./foodEvents');
const { logAudit } = require('./audit');
const { logNotification } = require('./notifications');
const { pushFoodOrderStatus, pushMerchantFeed, pingFoodAdmin } = require('./realtime');

// Credit summary for a restaurant (used / limit / warning / suspended).
function creditView(merchant) {
  const limit = Number(merchant.credit_limit);
  const used = round2(Number(merchant.credit_used));
  const alertAt = round2(limit * config.food.creditAlertPct);
  return {
    creditLimit: limit,
    creditUsed: used,
    creditRemaining: round2(Math.max(0, limit - used)),
    alertAt,
    warning: used >= alertAt && used < limit,
    exhausted: used >= limit,
    suspended: merchant.status === 'suspended',
  };
}

async function loadOrderByCode(code) {
  const { rows } = await database.query('SELECT * FROM public.orders WHERE order_code=$1 LIMIT 1', [code]);
  return rows[0] || null;
}

async function loadMerchantById(id) {
  const { rows } = await database.query('SELECT * FROM public.merchants WHERE id=$1 LIMIT 1', [id]);
  return rows[0] || null;
}

const auditAction = (base, actorRole) => (actorRole === 'admin' ? `admin_${base}` : `merchant_${base}`);

// Accepting an order. No longer credit-gated: the 300 SAR credit limit, the
// 80% warning and auto-suspend all hung off charging the platform margin
// here, and that charge is gone -- the margin is collected once, at
// checkout. The only remaining block is an ADMIN suspension, which is a
// moderation control rather than a money one.
async function acceptOrderCore({ orderCode, actorId, actorRole }) {
  const order = await loadOrderByCode(orderCode);
  if (!order) return { httpStatus: 404, body: { error: 'Order not found' } };
  if (order.status !== 'pending') {
    return { httpStatus: 409, body: { error: `Order is already ${order.status}` } };
  }
  const merchant = await loadMerchantById(order.merchant_id);
  if (!merchant) return { httpStatus: 404, body: { error: 'Merchant not found' } };

  const margin = round2(Number(order.platform_margin_total));

  // THE MARKUP IS COLLECTED ONCE, AT CHECKOUT.
  //
  // It is already inside the list price the customer paid, and the merchant
  // payout is `subtotal - markup`, so accepting an order must NOT also
  // charge that same markup to the merchant's credit line. It used to do
  // both, which billed the merchant twice: on a 71.00 subtotal with a 9.00
  // markup they were paid 62.00 AND accrued 9.00 of debt, netting 53.00.
  //
  // Admin suspension still blocks accepting -- that is a moderation
  // control, unrelated to money.
  if (merchant.status === 'suspended') {
    logFoodEvent({
      eventName: 'service_suspended',
      merchantId: merchant.id,
      params: { merchant_id: merchant.id },
    });
    return {
      httpStatus: 403,
      body: {
        error: `${merchant.name} is suspended and cannot accept new orders.`,
        failure_reason: 'merchant_suspended',
        credit: creditView(merchant),
      },
    };
  }

  // Flip the order pending -> accepted with a CAS so two simultaneous
  // accepts cannot both win. Nothing to roll back now that no money moves.
  const { rows: acceptedRows } = await database.query(
    `UPDATE public.orders SET status='accepted',accepted_at=now() WHERE id=$1 AND status='pending' RETURNING order_code`, [order.id],
  );
  if (acceptedRows.length === 0) {
    return { httpStatus: 409, body: { error: 'Order is no longer pending' } };
  }

  logFoodEvent({
    eventName: 'merchant_order_accept',
    userId: actorId,
    orderId: order.id,
    merchantId: merchant.id,
    params: { order_id: order.order_code, merchant_id: merchant.id },
  });
  logAudit({
    actorId,
    action: auditAction('food_order_accepted', actorRole),
    resourceType: 'order',
    resourceId: order.order_code,
    // Recorded, not charged: the markup is realised at checkout.
    meta: { margin_at_checkout: margin },
  });

  pushFoodOrderStatus(order.order_code, { status: 'accepted' });
  pushMerchantFeed(merchant.id, 'order_update', { orderCode: order.order_code, status: 'accepted' });
  pingFoodAdmin(order.order_code);
  logNotification({ userId: order.customer_id, type: 'food_order_accepted' });

  // Grab-style rider dispatch starts once the order is accepted AND either
  // paid or cash on delivery (the rider collects at the door). Lazy require
  // avoids a load-time circular dependency (dispatch.js also touches food
  // order state).
  if (order.payment_status === 'paid' || order.payment_method === 'cash') {
    const { startFoodDispatch } = require('./dispatch');
    startFoodDispatch(order.id);
  }

  return {
    httpStatus: 200,
    body: {
      orderCode: order.order_code,
      status: 'accepted',
      credit: creditView(merchant),
    },
  };
}

async function rejectOrderCore({ orderCode, actorId, actorRole, reason }) {
  const order = await loadOrderByCode(orderCode);
  if (!order) return { httpStatus: 404, body: { error: 'Order not found' } };
  if (order.status !== 'pending') {
    return { httpStatus: 409, body: { error: `Order is already ${order.status}` } };
  }

  const { rows } = await database.query(
    `UPDATE public.orders SET status='rejected',reject_reason=$2 WHERE id=$1 AND status='pending' RETURNING order_code`, [order.id,reason || null],
  );
  if (rows.length === 0) {
    return { httpStatus: 409, body: { error: 'Order is no longer pending' } };
  }

  logAudit({
    actorId,
    action: auditAction('food_order_rejected', actorRole),
    resourceType: 'order',
    resourceId: order.order_code,
    meta: { reason: reason || null, was_paid: order.payment_status === 'paid' },
  });
  pushFoodOrderStatus(order.order_code, { status: 'rejected', reason: reason || null });
  pushMerchantFeed(order.merchant_id, 'order_update', { orderCode: order.order_code, status: 'rejected' });
  pingFoodAdmin(order.order_code);
  logNotification({ userId: order.customer_id, type: 'food_order_rejected' });

  return {
    httpStatus: 200,
    body: { orderCode: order.order_code, status: 'rejected', refundDue: order.payment_status === 'paid' },
  };
}

// The fulfillment ladder — each status may only follow its predecessor.
// Riders normally advance out_for_delivery/delivered from their own portal
// (driverDispatchController.js) with mandatory photo proof; this ladder
// staying unrestricted here is intentional — restricting WHICH of these an
// actor may request is the route layer's job (the merchant route only
// allows 'preparing'/'ready'; the admin route allows the full ladder).
const NEXT_STATUS = {
  accepted: 'preparing',
  preparing: 'ready',
  ready: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

async function advanceOrderStatusCore({ orderCode, actorId, actorRole, status }) {
  const order = await loadOrderByCode(orderCode);
  if (!order) return { httpStatus: 404, body: { error: 'Order not found' } };

  if (NEXT_STATUS[order.status] !== status) {
    return { httpStatus: 409, body: { error: `Cannot move an order from "${order.status}" to "${status}"` } };
  }

  const { rows } = await database.query(
    `UPDATE public.orders SET status=$3, ready_at=CASE WHEN $3='ready' THEN now() ELSE ready_at END,
       delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END
     WHERE id=$1 AND status=$2 RETURNING order_code`, [order.id,order.status,status],
  );
  if (rows.length === 0) {
    return { httpStatus: 409, body: { error: 'Order status changed — please refresh' } };
  }

  // Cash on delivery settles at the door: mirror the rider portal
  // (driverDispatchController) and record the payment when this fallback
  // ladder marks the order delivered. Without this, cash orders advanced
  // this way stay 'awaiting' forever and drop out of settlement totals.
  // Best-effort: the order is already delivered at this point, so a payment
  // hiccup must not fail the request.
  if (status === 'delivered' && order.payment_method === 'cash' && order.payment_status === 'awaiting') {
    try {
      const { markOrderPaid } = require('../controllers/food/ordersController');
      await markOrderPaid(order, { provider: 'cash', actorId });
    } catch (payErr) {
      console.error('advanceOrderStatusCore cash markOrderPaid error:', payErr);
    }
  }

  logAudit({
    actorId,
    action: auditAction('food_order_status', actorRole),
    resourceType: 'order',
    resourceId: order.order_code,
    meta: { from: order.status, to: status },
  });
  pushFoodOrderStatus(order.order_code, { status });
  pushMerchantFeed(order.merchant_id, 'order_update', { orderCode: order.order_code, status });
  pingFoodAdmin(order.order_code);
  logNotification({ userId: order.customer_id, type: `food_order_${status}` });

  return { httpStatus: 200, body: { orderCode: order.order_code, status } };
}

// Cancel — admin/support, or (since the restaurant gained its own cancel
// button) the merchant itself. Twin of shopOrderActions.cancelOrderCore; the
// only differences are the table and that food reserves no stock.
//
// This lived inline in adminFoodController and could not be shared. Moving it
// here is what lets the merchant route reuse the credit reversal and the
// refund bookkeeping rather than growing a second, subtly different copy.
//
// Refunding a paid order stays a separate, deliberate admin action — the
// money went out by card or STC Pay and comes back the same way, by hand.
// What this guarantees is that it cannot be forgotten: the order lands in the
// admin refund queue (cancelled + still paid), and refundDue comes back so
// the customer can be told.
async function cancelOrderCore({
  orderCode,
  actorId,
  actorRole,
  reason,
  cancelledBy = 'admin',
  // When passed, restricts which statuses this caller may cancel from. The
  // merchant route stops at handover: once a rider is carrying the order,
  // cancelling is support's call.
  allowedStatuses = null,
}) {
  const order = await loadOrderByCode(orderCode);
  if (!order) return { httpStatus: 404, body: { error: 'Order not found' } };
  if (['delivered', 'cancelled', 'rejected'].includes(order.status)) {
    return { httpStatus: 409, body: { error: `Order is already ${order.status}` } };
  }
  if (allowedStatuses && !allowedStatuses.includes(order.status)) {
    return {
      httpStatus: 409,
      body: {
        error: `An order that is ${order.status} can only be cancelled by support.`,
        failure_reason: 'cancel_window_passed',
      },
    };
  }

  const { rows } = await database.query(
    `UPDATE public.orders SET status='cancelled',reject_reason=$3,cancelled_by=$4,cancelled_at=now()
     WHERE id=$1 AND status=$2 RETURNING order_code`, [order.id,order.status,reason || null,cancelledBy],
  );
  if (rows.length === 0) {
    return { httpStatus: 409, body: { error: 'The order status changed — please retry' } };
  }

  // Withdraw any live rider offer. Without this the offer stays pending and
  // unexpired: a rider tapping Accept seconds later wins the CAS and claims a
  // cancelled order, and the customer gets a "rider assigned" push for an
  // order they were just told was cancelled.
  await database.query(
    `UPDATE public.dispatch_offers SET status='cancelled',responded_at=now()
     WHERE order_id=$1 AND status='pending'`, [order.id],
  );

  // Free a rider who was holding it and had not collected yet.
  try {
    const { releaseFoodDelivery } = require('./dispatch');
    await releaseFoodDelivery(order.id, { cause: 'order_cancelled', redispatch: false });
  } catch (err) {
    console.error('food cancelOrderCore release delivery error:', err.message || err);
  }

  // Nothing to reverse. Accepting no longer charges the markup to the
  // merchant's credit -- it is collected once, at checkout -- so a cancel has
  // no credit charge to give back. Left as a no-op rather than deleted
  // because reverseOrderMargin clamps at zero and would otherwise quietly
  // draw down a merchant's HISTORICAL balance from before that change, paying
  // them back for a charge this cancel never made.
  const creditReversal = { reversed: false, amount: 0 };

  const refundDue = order.payment_status === 'paid';

  logAudit({
    actorId,
    action: auditAction('food_order_cancelled', actorRole),
    resourceType: 'order',
    resourceId: order.order_code,
    meta: {
      reason: reason || null,
      was: order.status,
      cancelled_by: cancelledBy,
      margin_reversed: creditReversal.reversed ? creditReversal.amount : 0,
      refund_due: refundDue,
    },
  });
  pushFoodOrderStatus(order.order_code, { status: 'cancelled' });
  pushMerchantFeed(order.merchant_id, 'order_update', {
    orderCode: order.order_code,
    status: 'cancelled',
  });
  pingFoodAdmin(order.order_code);
  logNotification({
    userId: order.customer_id,
    // A restaurant cancelling is a different message from support cancelling.
    type: cancelledBy === 'merchant' ? 'food_order_cancelled_by_store' : 'food_order_cancelled',
    code: order.order_code,
    orderId: order.id,
  });

  return {
    httpStatus: 200,
    body: {
      orderCode: order.order_code,
      status: 'cancelled',
      refundDue,
      marginReversed: creditReversal.reversed ? creditReversal.amount : 0,
    },
  };
}

module.exports = {
  creditView,
  loadOrderByCode,
  loadMerchantById,
  NEXT_STATUS,
  acceptOrderCore,
  rejectOrderCore,
  advanceOrderStatusCore,
  cancelOrderCore,
};
