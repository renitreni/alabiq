// ---------------------------------------------------------------------
// Business Owner portal — order management (the restaurant's own live
// incoming-orders dashboard). Every query is scoped to the signed-in
// owner's restaurant via merchants.owner_id (loadOwnedMerchant, shared with
// merchantController.js). Accept/reject/advance-status share their actual
// logic (credit gating, platform margin, the fulfillment ladder) with the
// admin fallback via backend/lib/foodOrderActions.js — never duplicated.
// ---------------------------------------------------------------------
const merchantOrdersRepository = require('../repositories/merchantOrdersRepository');
const { requireOwnedMerchant } = require('./merchantController');
const {
  loadOrderByCode,
  acceptOrderCore,
  rejectOrderCore,
  advanceOrderStatusCore,
  cancelOrderCore,
} = require('../lib/foodOrderActions');

// GET /api/merchant/orders — this restaurant's own orders only. Never
// selects/returns platform_margin_total: that stays confidential to admin
// (same convention as ordersController.js's customer-facing getOrder).
async function listOrders(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;

    const status = (req.query.status || '').toString();
    const data = await merchantOrdersRepository.listForMerchant({ merchantId: merchant.id, status, limit: 100 });

    return res.json({
      orders: data.map((o) => {
        const delivery = o.delivery_status ? o : null;
        return {
          // The order's own code doubles as the pickup-verification code —
          // compare what the driver states against this before handing over
          // the food.
          orderCode: o.order_code,
          status: o.status,
          paymentStatus: o.payment_status,
          paymentMethod: o.payment_method,
          subtotal: o.subtotal,
          deliveryFee: o.delivery_fee,
          total: o.total,
          deliveryAddress: o.delivery_address,
          deliveryStreet: o.delivery_street,
          deliveryBuilding: o.delivery_building,
          customerName: o.customer_name,
          customerMobile: o.customer_mobile,
          items: o.items || [],
          riderName: delivery ? o.rider_name : null,
          riderWhatsapp: delivery ? o.rider_whatsapp : null,
          riderMobile: delivery ? o.rider_mobile : null,
          riderAssigned: !!delivery,
          hasPickupPhoto: !!(delivery && delivery.pickup_photo_path),
          hasDeliveryPhoto: !!(delivery && delivery.delivery_photo_path),
          createdAt: o.created_at,
          deliveredAt: o.delivered_at,
        };
      }),
    });
  } catch (err) {
    console.error('merchant listOrders error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// Every mutating action here first confirms the order actually belongs to
// the signed-in restaurant (404, not 403, so a wrong/foreign order code
// doesn't reveal that a valid order exists elsewhere) before touching the
// shared core — the core itself trusts the caller already did this check.
async function assertOwnedOrder(req, res, merchant) {
  const order = await loadOrderByCode(req.params.code);
  if (!order || order.merchant_id !== merchant.id) {
    res.status(404).json({ error: 'Order not found' });
    return null;
  }
  return order;
}

async function acceptOrder(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;
    if (!(await assertOwnedOrder(req, res, merchant))) return;

    const { httpStatus, body } = await acceptOrderCore({
      orderCode: req.params.code,
      actorId: req.merchantOwnerId,
      actorRole: 'merchant',
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('merchant acceptOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function rejectOrder(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;
    if (!(await assertOwnedOrder(req, res, merchant))) return;

    const { httpStatus, body } = await rejectOrderCore({
      orderCode: req.params.code,
      actorId: req.merchantOwnerId,
      actorRole: 'merchant',
      reason: (req.body && req.body.reason) || null,
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('merchant rejectOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// Merchant authority stops at "ready" — the route's validateBody enum
// (['preparing', 'ready']) is the actual enforcement of that limit; this
// handler doesn't need its own extra guard because advanceOrderStatusCore
// will simply reject any status that isn't the immediate next rung anyway.
async function advanceStatus(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;
    if (!(await assertOwnedOrder(req, res, merchant))) return;

    const { httpStatus, body } = await advanceOrderStatusCore({
      orderCode: req.params.code,
      actorId: req.merchantOwnerId,
      actorRole: 'merchant',
      status: req.body.status,
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('merchant advanceStatus error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// Cancel an order the restaurant has ALREADY accepted — the "sorry, we can
// no longer make this" case. Rejecting only works while an order is pending,
// so before this there was no way for a restaurant to withdraw once it had
// said yes, and support had to be called.
//
// MERCHANT_CANCELLABLE stops at 'ready'. Once a rider is carrying the food
// (out_for_delivery) the restaurant is no longer the one who can cancel it —
// the same boundary that stops merchant advanceStatus at 'ready'.
const MERCHANT_CANCELLABLE = ['accepted', 'preparing', 'ready'];

async function cancelOrder(req, res) {
  try {
    const merchant = await requireOwnedMerchant(req, res);
    if (!merchant) return;
    if (!(await assertOwnedOrder(req, res, merchant))) return;

    const { httpStatus, body } = await cancelOrderCore({
      orderCode: req.params.code,
      actorId: req.merchantOwnerId,
      actorRole: 'merchant',
      // Required by the route schema, unlike the admin one: the customer is
      // shown this sentence verbatim.
      reason: (req.body && req.body.reason) || null,
      cancelledBy: 'merchant',
      allowedStatuses: MERCHANT_CANCELLABLE,
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('merchant cancelOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { listOrders, acceptOrder, rejectOrder, advanceStatus, cancelOrder };
