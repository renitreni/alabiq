'use strict';

const database = require('../lib/database/pool');
const { config } = require('../lib/config');
const { latestDriverFix } = require('../lib/tracking');
const { travelEtaMinutes } = require('../lib/eta');
const crypto = require('crypto');

// Active delivery states where rider location is shown
const ACTIVE_DELIVERY_STATUSES = ['searching', 'assigned', 'picked_up'];

// --- Public Tracking ---
// GET /track/delivery/:trackingId
async function getPublicTracking(req, res) {
  try {
    const { trackingId } = req.params;
    // Accept token from query param or header (for frontend API client)
    const token = req.query.token || req.headers['x-tracking-token'];
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    if (!token) {
      return res.status(400).json({ error: { code: 'invalid_request', message: 'Tracking token is required', request_id: requestId } });
    }

    // Find delivery by tracking token hash
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await database.query(
      `SELECT d.id,d.order_id,d.merchant_id,d.status,d.driver_id,d.driver_fee,d.pickup_photo_path,d.delivery_photo_path,
         d.created_at,d.assigned_at,d.picked_up_at,d.delivered_at,d.cancelled_at,
         o.order_code,o.external_order_id,o.delivery_address,
         o.delivery_lat,o.delivery_lng,o.delivery_street,o.delivery_building,o.contact_phone,
         o.tracking_token_expires_at,o.tracking_token_revoked_at,
         m.name as merchant_name,m.address as merchant_address,m.lat as merchant_lat,m.lng as merchant_lng,
         p.full_name as rider_name,p.vehicle_type,p.vehicle_plate
       FROM public.deliveries d
       JOIN public.orders o ON o.id=d.order_id
       JOIN public.merchants m ON m.id=o.merchant_id
       LEFT JOIN public.profiles p ON p.id=d.driver_id
       WHERE o.tracking_token_hash=$1 AND o.source='restaurant_partner'
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Delivery not found or token invalid', request_id: requestId } });
    }

    const delivery = rows[0];

    // Check token expiry/revocation
    if (delivery.tracking_token_expires_at && new Date(delivery.tracking_token_expires_at) < new Date()) {
      return res.status(403).json({ error: { code: 'token_expired', message: 'Tracking token has expired', request_id: requestId } });
    }
    if (delivery.tracking_token_revoked_at) {
      return res.status(403).json({ error: { code: 'token_revoked', message: 'Tracking token has been revoked', request_id: requestId } });
    }

    // Fetch live rider location only while the delivery is active — the same
    // source (lib/tracking.latestDriverFix) the authenticated tracking uses.
    const riderLocation = delivery.driver_id && ACTIVE_DELIVERY_STATUSES.includes(delivery.status)
      ? await latestDriverFix(delivery.driver_id)
      : null;

    // Build minimal public DTO
    const response = buildPublicTrackingResponse(delivery, riderLocation);
    return res.json(response);
  } catch (err) {
    console.error('getPublicTracking error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

// GET /track/delivery/:trackingId/stream (SSE via realtime service)
async function getPublicTrackingSSE(req, res) {
  try {
    const { trackingId } = req.params;
    // Accept token from query param or header (for frontend API client)
    const token = req.query.token || req.headers['x-tracking-token'];
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    if (!token) {
      return res.status(400).json({ error: { code: 'invalid_request', message: 'Tracking token is required', request_id: requestId } });
    }

    // Validate token once and get order_code for realtime topic
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await database.query(
      `SELECT o.id, o.order_code FROM public.orders o WHERE o.tracking_token_hash=$1 AND o.source='restaurant_partner' LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Delivery not found or token invalid', request_id: requestId } });
    }

    const { id: orderId, order_code: orderCode } = rows[0];

    // Check token expiry/revocation before starting SSE
    const { rows: orderRows } = await database.query(
      `SELECT o.tracking_token_expires_at, o.tracking_token_revoked_at FROM public.orders o WHERE o.id=$1 LIMIT 1`,
      [orderId]
    );
    const order = orderRows[0];
    if (order.tracking_token_expires_at && new Date(order.tracking_token_expires_at) < new Date()) {
      return res.status(403).json({ error: { code: 'token_expired', message: 'Tracking token has expired', request_id: requestId } });
    }
    if (order.tracking_token_revoked_at) {
      return res.status(403).json({ error: { code: 'token_revoked', message: 'Tracking token has been revoked', request_id: requestId } });
    }

    // Set up SSE
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    // Send initial state
    const initial = await getPublicTrackingData(tokenHash);
    if (initial) {
      res.write(`data: ${JSON.stringify({ type: 'state', payload: initial })}\n\n`);
    }

    // Proxy to realtime service via /subscribe
    // why: replaces per-client polling with Redis pub/sub fan-out (O(1) DB load).
    // Topic is fd-order-<orderCode>: the dispatch path (lib/dispatch.js) already
    // broadcasts it for partner orders too — payload { status, rider } — so no
    // separate publisher is needed.
    const topic = `fd-order-${orderCode}`;
    const base = process.env.REALTIME_INTERNAL_URL || 'http://realtime:4100';
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    let connectTimer;
    try {
      connectTimer = setTimeout(() => abort.abort(), 5000);
      const upstream = await fetch(
        `${base}/subscribe?topic=${encodeURIComponent(topic)}`,
        { signal: abort.signal }
      );
      clearTimeout(connectTimer);
      if (!upstream.ok || !upstream.body) {
        if (!res.headersSent) return res.status(503).json({ error: 'Live updates are temporarily unavailable' });
        return res.end('event: error\ndata: {}\n\n');
      }
      for await (const chunk of upstream.body) {
        if (res.writableEnded) break;
        if (!res.write(chunk)) await new Promise((resolve) => res.once('drain', resolve));
        // Check for terminal state in the payload and close if needed
        try {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              if (data.payload && ['delivered', 'cancelled'].includes(data.payload.status)) {
                // Terminal state - close the stream
                res.end();
                return;
              }
            }
          }
        } catch (e) {
          // Ignore parse errors, just forward the chunk
        }
      }
      if (!res.writableEnded) res.end();
    } catch (err) {
      clearTimeout(connectTimer);
      if (err.name !== 'AbortError') {
        console.error('realtime subscription failed:', err.message);
        if (res.headersSent) res.end('event: error\ndata: {}\n\n');
        else res.status(503).json({ error: 'Live updates are temporarily unavailable' });
      }
    }
  } catch (err) {
    console.error('getPublicTrackingSSE error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
    }
  }
}

async function getPublicTrackingData(tokenHash) {
  const { rows } = await database.query(
    `SELECT d.id,d.order_id,d.merchant_id,d.status,d.driver_id,d.driver_fee,d.pickup_photo_path,d.delivery_photo_path,
       d.created_at,d.assigned_at,d.picked_up_at,d.delivered_at,d.cancelled_at,
       o.order_code,o.external_order_id,o.delivery_address,
       o.delivery_lat,o.delivery_lng,o.delivery_street,o.delivery_building,o.contact_phone,
       o.tracking_token_expires_at,o.tracking_token_revoked_at,
       m.name as merchant_name,m.address as merchant_address,m.lat as merchant_lat,m.lng as merchant_lng,
       p.full_name as rider_name,p.vehicle_type,p.vehicle_plate
     FROM public.deliveries d
     JOIN public.orders o ON o.id=d.order_id
     JOIN public.merchants m ON m.id=o.merchant_id
     LEFT JOIN public.profiles p ON p.id=d.driver_id
     WHERE o.tracking_token_hash=$1 AND o.source='restaurant_partner'
     LIMIT 1`,
    [tokenHash]
  );
  const delivery = rows[0];
  const riderLocation = delivery.driver_id && ACTIVE_DELIVERY_STATUSES.includes(delivery.status)
    ? await latestDriverFix(delivery.driver_id)
    : null;
  return rows[0] ? buildPublicTrackingResponse(rows[0], riderLocation) : null;
}

function buildPublicTrackingResponse(delivery, liveRiderLocation = null) {
  // Only show rider location during active delivery
  let rider = null;
  let riderLocation = null;

  if (delivery.driver_id && ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) {
    // Rider identity from the joined profiles row
    rider = {
      name: delivery.rider_name || 'Rider',
      vehicle_type: delivery.vehicle_type || null,
      vehicle_plate: delivery.vehicle_plate || null,
    };

    // Live fix fetched by the caller via latestDriverFix — the same source the
    // authenticated tracking endpoint trusts.
    if (liveRiderLocation) {
      riderLocation = {
        lat: liveRiderLocation.lat,
        lng: liveRiderLocation.lng,
        at: liveRiderLocation.at,
      };
    }
  }

  // Mask drop-off for privacy - round coordinates to ~100m precision (0.001 degree ≈ 111m)
  // why: exact drop-off coordinates are PII; customer knows the restaurant, not the delivery address
  // Merchant coordinates are kept exact since the customer knows the restaurant location
  const maskedDropoff = delivery.delivery_address ? {
    address: maskAddress(delivery.delivery_address),
    lat: delivery.delivery_lat != null ? Math.round(delivery.delivery_lat * 1000) / 1000 : null,
    lng: delivery.delivery_lng != null ? Math.round(delivery.delivery_lng * 1000) / 1000 : null,
  } : null;

  return {
    delivery_id: delivery.id,
    order_code: delivery.order_code,
    external_order_id: delivery.external_order_id,
    status: delivery.status,
    substatus: delivery.status === 'searching' && !delivery.driver_id ? 'searching' : null,
    merchant: {
      name: delivery.merchant_name,
      address: delivery.merchant_address,
      lat: delivery.merchant_lat,
      lng: delivery.merchant_lng,
    },
    dropoff: maskedDropoff,
    rider,
    rider_location: riderLocation,
    timestamps: {
      created_at: delivery.created_at,
      assigned_at: delivery.assigned_at || null,
      picked_up_at: delivery.picked_up_at || null,
      delivered_at: delivery.delivered_at || null,
      cancelled_at: delivery.cancelled_at || null,
    },
    // Terminal state = stop location updates
    terminal: ['delivered', 'cancelled'].includes(delivery.status),
  };
}

function maskAddress(address) {
  if (!address) return null;
  // Show only general area, not exact building/unit
  const parts = address.split(',');
  return parts.slice(0, 2).join(',') + ', [hidden]';
}

module.exports = { getPublicTracking, getPublicTrackingSSE };
