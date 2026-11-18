// ---------------------------------------------------------------------
// Store owner portal — the live orders queue.
//
// Thin by design: accept / reject / advance all delegate to
// lib/shopOrderActions.js, which is the SAME code the admin fallback runs.
// Money-critical behaviour (the credit gate, the markup charge, the ledger
// row, the stock release on reject) therefore cannot drift between the two
// entry points.
//
// WHAT A STORE MAY NOT SEE: platform_margin_total is absent from the select
// below. The store knows its list prices and what it is owed; our cut is
// not its business, and 0029 hides the column from the anon key for the
// same reason.
//
// WHAT A STORE MAY NOT DO: advance past 'ready'. out_for_delivery and
// delivered are rider-only, evidenced by photo proof and a geofence. The
// route schema enforces this; so does STATUS_FLOW in shopOrderActions.
// ---------------------------------------------------------------------
const ordersRepository = require('../repositories/merchantShopOrdersRepository');
const {
  acceptOrderCore,
  rejectOrderCore,
  advanceOrderStatusCore,
  cancelOrderCore,
  creditView,
} = require('../lib/shopOrderActions');
const { requireOwnedStore } = require('./merchantShopController');

// A foreign order code is a 404, never a 403: a store must not be able to
// probe whether an order code exists at another store.
async function assertOwnedOrder(storeId, code, res) {
  const data = await ordersRepository.ownedOrder(storeId, code);
  if (!data || data.merchant_id !== storeId) {
    res.status(404).json({ error: 'Order not found' });
    return false;
  }
  return true;
}

async function listOrders(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;

    const data = await ordersRepository.listForStore(store.id, 100);

    return res.json({
      orders: data.map((o) => {
        const delivery = o.delivery_status ? o : null;
        return {
          orderCode: o.order_code,
          status: o.status,
          subtotal: o.subtotal,
          deliveryFee: o.delivery_fee,
          vatAmount: o.vat_amount,
          vatRate: o.vat_rate,
          total: o.total,
          deliveryAddress: o.delivery_address,
          deliveryStreet: o.delivery_street,
          deliveryBuilding: o.delivery_building,
          contactPhone: o.contact_phone,
          paymentStatus: o.payment_status,
          paymentMethod: o.payment_method,
          rejectReason: o.reject_reason,
          createdAt: o.created_at,
          acceptedAt: o.accepted_at,
          packedAt: o.packed_at,
          readyAt: o.ready_at,
          deliveredAt: o.delivered_at,
          items: o.items || [],
          customer: o.customer_name
            ? {
                name: o.customer_name,
                // The order's own number wins: the customer may have edited
                // it after placing the order.
                mobile: o.contact_phone || o.customer_mobile,
                whatsapp: o.customer_whatsapp,
              }
            : null,
          rider: delivery
            ? {
                status: delivery.status,
                assigned: !!delivery.driver_id,
                hasPickupPhoto: !!delivery.pickup_photo_path,
                hasDeliveryPhoto: !!delivery.delivery_photo_path,
              }
            : null,
        };
      }),
      credit: creditView(store),
    });
  } catch (err) {
    console.error('merchant shop listOrders error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function acceptOrder(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if (!(await assertOwnedOrder(store.id, req.params.code, res))) return undefined;

    const { httpStatus, body } = await acceptOrderCore({
      orderCode: req.params.code,
      actorId: req.merchantOwnerId,
      actorRole: 'merchant',
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('merchant shop acceptOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function rejectOrder(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if (!(await assertOwnedOrder(store.id, req.params.code, res))) return undefined;

    const { httpStatus, body } = await rejectOrderCore({
      orderCode: req.params.code,
      actorId: req.merchantOwnerId,
      actorRole: 'merchant',
      reason: req.body.reason || null,
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('merchant shop rejectOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function advanceStatus(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if (!(await assertOwnedOrder(store.id, req.params.code, res))) return undefined;

    const { httpStatus, body } = await advanceOrderStatusCore({
      orderCode: req.params.code,
      status: req.body.status, // route schema caps this at packing | ready
      actorId: req.merchantOwnerId,
      actorRole: 'merchant',
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('merchant shop advanceStatus error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// Cancel an order the store has ALREADY accepted — the "most or all items
// are no longer available" case. Rejecting only works while an order is
// pending, so before this a store that started packing and found the shelf
// empty had to call support.
//
// Stops at 'ready', the same boundary that stops advanceStatus: once a rider
// is carrying the goods, cancelling is support's call.
const MERCHANT_CANCELLABLE = ['accepted', 'packing', 'ready'];

async function cancelOrder(req, res) {
  try {
    const store = await requireOwnedStore(req, res);
    if (!store) return undefined;
    if (!(await assertOwnedOrder(store.id, req.params.code, res))) return undefined;

    const { httpStatus, body } = await cancelOrderCore({
      orderCode: req.params.code,
      actorId: req.merchantOwnerId,
      actorRole: 'merchant',
      // Required by the route schema, unlike the admin one: the customer is
      // shown this sentence verbatim.
      reason: req.body.reason || null,
      cancelledBy: 'merchant',
      allowedStatuses: MERCHANT_CANCELLABLE,
    });
    return res.status(httpStatus).json(body);
  } catch (err) {
    console.error('merchant shop cancelOrder error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { listOrders, acceptOrder, rejectOrder, advanceStatus, cancelOrder };
