// ---------------------------------------------------------------------
// Application-owned realtime — server-side broadcast to the dedicated service.
//
// Passengers book as guests (no Supabase auth), so postgres_changes can't
// safely reach them without leaking internal ids. Instead the server PUSHES
// Broadcast messages over its internal HTTP API. The API authorizes each SSE
// subscriber before proxying the stream. Redis fans events across instances.
//
//   booking-<bookingCode>  -> one passenger watching their own booking
//   drivers-available      -> shared feed of new / taken ride requests
//   admin-bookings         -> shared feed for the admin dashboard
//
// Every payload contains ONLY safe fields (never the booking UUID).
// Failures are swallowed: realtime is a nicety, never blocks the request.
// ---------------------------------------------------------------------
const url = process.env.REALTIME_INTERNAL_URL || 'http://realtime:4100';
const key = process.env.REALTIME_PUBLISH_TOKEN || '';
const { fetchWithTimeout } = require('./httpTimeout');

async function broadcast(topic, event, payload) {
  try {
    // 3s. The header above promises realtime never blocks the request, and
    // that was true for ERRORS but not for LATENCY -- these calls are
    // awaited from inside the dispatch loop and the order controllers, so a
    // hanging broadcast endpoint was blocking order acceptance itself.
    if (!key) throw new Error('REALTIME_PUBLISH_TOKEN is not configured');
    const res = await fetchWithTimeout(3000)(`${url}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ topic, event, payload }),
    });
    if (!res.ok) {
      console.error('realtime broadcast failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('realtime broadcast error:', err);
  }
}

function pushBookingStatus(code, payload) {
  return broadcast(`booking-${code}`, 'status', payload);
}

// A newly-verified booking becomes available for any driver to accept.
// Carries NO data: this topic is joinable by anyone with the anon key.
function announceAvailableRide() {
  return Promise.all([
    broadcast('drivers-available', 'new_request', {}),
    broadcast('admin-bookings', 'changed', {}),
  ]);
}

// A booking was claimed (or cancelled) — remove it from the open feed.
// Also carries nothing: a booking code is enough to read the passenger's
// phone number off the public tracking endpoint.
function announceRequestTaken() {
  return Promise.all([
    broadcast('drivers-available', 'request_taken', {}),
    broadcast('admin-bookings', 'changed', {}),
  ]);
}

function pingAdmin(code) {
  return broadcast('admin-bookings', 'changed', { bookingCode: code });
}

// --- Food Delivery channels ---
//   fd-order-<orderCode>  -> the customer tracking one food order
//   merchant-<merchantId> -> a restaurant's live incoming-orders feed
//   admin-food            -> shared feed for the admin Food tab
// Payloads carry only safe public fields (order code, statuses) — never
// internal UUIDs of other parties or money internals beyond the order's own.

function pushFoodOrderStatus(orderCode, payload) {
  return broadcast(`fd-order-${orderCode}`, 'status', payload);
}

// Nudge a restaurant's dashboard (new order, payment update, ...).
function pushMerchantFeed(merchantId, event, payload) {
  return broadcast(`merchant-${merchantId}`, event, payload);
}

function pingFoodAdmin(orderCode) {
  return broadcast('admin-food', 'changed', { orderCode });
}

// --- Ecommerce ("shop") channels ---
//   shop-order-<orderCode> -> the customer tracking one shop order
//   merchant-<merchantId>  -> REUSED as-is; a store's dashboard subscribes
//                             to the same per-merchant topic a restaurant
//                             does, so pushMerchantFeed needs no shop twin
//   admin-shop             -> shared feed for the admin Shop tab
// Same payload discipline as food: order code and statuses only, never
// internal UUIDs of other parties and never margin data.

function pushShopOrderStatus(orderCode, payload) {
  return broadcast(`shop-order-${orderCode}`, 'status', payload);
}

function pingShopAdmin(orderCode) {
  return broadcast('admin-shop', 'changed', { orderCode });
}

module.exports = {
  broadcast,
  pushBookingStatus,
  announceAvailableRide,
  announceRequestTaken,
  pingAdmin,
  pushFoodOrderStatus,
  pushMerchantFeed,
  pingFoodAdmin,
  pushShopOrderStatus,
  pingShopAdmin,
};
