'use strict';

const database = require('../lib/database/pool');
const { config } = require('../lib/config');
const { latestDriverFix } = require('../lib/tracking');
const { travelEtaMinutes } = require('../lib/eta');
const crypto = require('crypto');

// Active delivery states where rider location is shown
const ACTIVE_DELIVERY_STATUSES = ['searching', 'assigned', 'picked_up'];

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
         o.order_code,o.external_order_id,o.customer_name,o.customer_mobile,o.delivery_address,
         o.delivery_lat,o.delivery_lng,o.delivery_street,o.delivery_building,o.contact_phone,
         o.subtotal,o.delivery_fee,o.delivery_surcharge,o.platform_margin_total,o.vat_rate,o.vat_amount,o.total,
         o.payment_status,o.payment_method,o.external_payment_reference,o.status as order_status,
         o.accepted_at,o.ready_at,o.delivered_at as order_delivered_at,o.reject_reason,o.cancelled_by,o.cancelled_at,
         m.name as merchant_name,m.address as merchant_address,m.lat as merchant_lat,m.lng as merchant_lng
       FROM public.deliveries d
       JOIN public.orders o ON o.id=d.order_id
       JOIN public.merchants m ON m.id=o.merchant_id
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

    // Build minimal public DTO
    const response = buildPublicTrackingResponse(delivery);
    return res.json(response);
  } catch (err) {
    console.error('getPublicTracking error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function getPublicTrackingSSE(req, res) {
  try {
    const { trackingId } = req.params;
    // Accept token from query param or header (for frontend API client)
    const token = req.query.token || req.headers['x-tracking-token'];
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    if (!token) {
      return res.status(400).json({ error: { code: 'invalid_request', message: 'Tracking token is required', request_id: requestId } });
    }

    // Validate token once
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await database.query(
      `SELECT o.id FROM public.orders o WHERE o.tracking_token_hash=$1 AND o.source='restaurant_partner' LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Delivery not found or token invalid', request_id: requestId } });
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

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 30000);

    // Subscribe to realtime topic (would need realtime service integration)
    // For now, just send periodic updates via polling fallback
    const pollInterval = setInterval(async () => {
      const update = await getPublicTrackingData(tokenHash);
      if (update) {
        res.write(`data: ${JSON.stringify({ type: 'update', payload: update })}\n\n`);
      }
      // Stop polling at terminal state
      if (['delivered', 'cancelled'].includes(update?.status)) {
        clearInterval(pollInterval);
        clearInterval(heartbeat);
        res.end();
      }
    }, 8000);

    req.on('close', () => {
      clearInterval(pollInterval);
      clearInterval(heartbeat);
    });
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
       o.order_code,o.external_order_id,o.customer_name,o.customer_mobile,o.delivery_address,
       o.delivery_lat,o.delivery_lng,o.delivery_street,o.delivery_building,o.contact_phone,
       o.subtotal,o.delivery_fee,o.delivery_surcharge,o.platform_margin_total,o.vat_rate,o.vat_amount,o.total,
       o.payment_status,o.payment_method,o.external_payment_reference,o.status as order_status,
       o.accepted_at,o.ready_at,o.delivered_at as order_delivered_at,o.reject_reason,o.cancelled_by,o.cancelled_at,
       m.name as merchant_name,m.address as merchant_address,m.lat as merchant_lat,m.lng as merchant_lng
     FROM public.deliveries d
     JOIN public.orders o ON o.id=d.order_id
     JOIN public.merchants m ON m.id=o.merchant_id
     WHERE o.tracking_token_hash=$1 AND o.source='restaurant_partner'
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] ? buildPublicTrackingResponse(rows[0]) : null;
}

function buildPublicTrackingResponse(delivery) {
  // Only show rider location during active delivery
  let rider = null;
  let riderLocation = null;

  if (delivery.driver_id && ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) {
    // Fetch driver info
    // In production, this would come from a joined query or separate lookup
    // For now, include basic info if available
    rider = {
      name: delivery.rider_name || 'Rider',
      vehicle_type: delivery.vehicle_type || null,
      vehicle_plate: delivery.vehicle_plate || null,
    };

    // Note: live location would need a separate query or realtime subscription
    // The SSE/polling will handle live updates
  }

  // Mask drop-off for privacy
  const maskedDropoff = delivery.delivery_address ? {
    address: maskAddress(delivery.delivery_address),
    lat: delivery.delivery_lat,
    lng: delivery.delivery_lng,
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
