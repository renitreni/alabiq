'use strict';

const { config } = require('../../lib/config');
const { validateBody } = require('../../lib/validate');
const { haversineKm } = require('../../lib/geo');
const { priceOrder: priceFoodOrder } = require('../../lib/foodMoney');
const { surchargeFor, exceedsMaxRadius, driverShareOf } = require('../../lib/deliveryPricing');
const { getMaxDistanceKm } = require('../../lib/settings');
const { merchantOpenState } = require('../../lib/storeHours');
const partnerRepository = require('../../repositories/partnerRepository');
const { logAudit } = require('../../lib/audit');
const crypto = require('crypto');

const QUOTE_TTL_MS = () => config.partnerApi.quoteTtlSeconds * 1000;
const IDEMPOTENCY_RETENTION_MS = () => config.partnerApi.idempotencyRetentionHours * 60 * 60 * 1000;

// --- Validation schemas ----------------------------------------------------

const LOCATION_SCHEMA = {
  lat: { type: 'number', required: true, min: -90, max: 90 },
  lng: { type: 'number', required: true, min: -180, max: 180 },
  address: { type: 'string', required: true, maxLength: 500 },
  instructions: { type: 'string', maxLength: 500, nullable: true },
};

const CUSTOMER_SCHEMA = {
  name: { type: 'string', required: true, maxLength: 120 },
  phone: { type: 'string', required: true, pattern: '^\\+9665\\d{8}$' },
};

const ITEM_SCHEMA = {
  name: { type: 'string', required: true, maxLength: 200 },
  quantity: { type: 'integer', required: true, min: 1, max: 100 },
};

const AMOUNT_SCHEMA = {
  amount_minor: { type: 'integer', required: true, min: 0 },
  currency: { type: 'string', required: true, enum: ['SAR'] },
};

const EXTERNAL_PAYMENT_SCHEMA = {
  status: { type: 'string', required: true, enum: ['paid'] },
  reference: { type: 'string', maxLength: 120, nullable: true },
};

// --- Helpers ---------------------------------------------------------------

function generateIdempotencyExpiry() {
  return new Date(Date.now() + IDEMPOTENCY_RETENTION_MS());
}

function generateQuoteExpiry() {
  return new Date(Date.now() + QUOTE_TTL_MS());
}

function generateTrackingToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashTrackingToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildTrackingUrl(token) {
  const base = config.publicUrls.web || 'https://alabiq.com';
  return `${base}/track/delivery/${token}`;
}

async function validateQuoteRequest(merchantId, dropoff) {
  // Load merchant to get pickup location and check status
  const { loadMerchantById } = require('../../lib/merchantOwner');
  const merchant = await loadMerchantById(merchantId);
  if (!merchant) throw new Error('merchant_not_found');
  if (!merchant.is_active || merchant.status !== 'active') throw new Error('restaurant_suspended');
  if (!merchant.accepting_orders) throw new Error('restaurant_not_accepting');
  if (!Number.isFinite(merchant.lat) || !Number.isFinite(merchant.lng)) throw new Error('restaurant_location_required');

  // Check service area
  const distance = haversineKm(merchant.lat, merchant.lng, dropoff.lat, dropoff.lng);
  const maxRadius = await getMaxDistanceKm();
  if (exceedsMaxRadius(distance, maxRadius)) throw new Error('outside_service_area');

  // Check open hours
  const openState = merchantOpenState({ acceptingOrders: merchant.accepting_orders, hours: merchant.hours || [] });
  if (!openState.isOpen) throw new Error('restaurant_closed');

  return { merchant, distance };
}

function computeDeliveryFee(distanceKm) {
  const baseFee = config.food.deliveryFeeSar * 100; // convert to minor
  const { surcharge } = surchargeFor(distanceKm);
  return Math.round(baseFee + surcharge * 100);
}

// --- Controllers -----------------------------------------------------------

// POST /delivery-quotes
async function createQuote(req, res) {
  try {
    const { external_order_id, dropoff } = req.body;
    const merchantId = req.partnerCredential.merchantId;
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    // Validate merchant and service area
    let validation;
    try {
      validation = await validateQuoteRequest(merchantId, dropoff);
    } catch (err) {
      const codeMap = {
        merchant_not_found: 'not_found',
        restaurant_suspended: 'restaurant_suspended',
        restaurant_not_accepting: 'restaurant_suspended',
        restaurant_location_required: 'invalid_request',
        outside_service_area: 'outside_service_area',
        restaurant_closed: 'restaurant_suspended',
      };
      return res.status(422).json({
        error: { code: codeMap[err.message] || 'invalid_request', message: err.message, request_id: requestId }
      });
    }

    const { merchant, distance } = validation;
    const deliveryFeeMinor = computeDeliveryFee(distance);
    const expiresAt = generateQuoteExpiry();

    // Create request hash for idempotency
    const requestHash = partnerRepository.hashRequest({ external_order_id, dropoff });

    // Create or update quote
    const quote = await partnerRepository.createQuote({
      merchantId,
      externalOrderId: external_order_id,
      pickupLat: merchant.lat,
      pickupLng: merchant.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      dropoffAddress: dropoff.address,
      dropoffInstructions: dropoff.instructions || null,
      deliveryFeeMinor,
      currency: 'SAR',
      pricingVersion: 'v1',
      requestHash,
      expiresAt,
    });

    return res.status(201).json({
      quote_id: quote.id,
      external_order_id: quote.external_order_id,
      currency: quote.currency,
      delivery_fee_minor: quote.delivery_fee_minor,
      expires_at: quote.expires_at.toISOString(),
    });
  } catch (err) {
    console.error('createQuote error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

// POST /deliveries
async function createDelivery(req, res) {
  try {
    const {
      external_order_id,
      quote_id,
      customer,
      dropoff,
      items,
      merchandise_total,
      external_payment,
      preparation_status,
    } = req.body;
    const merchantId = req.partnerCredential.merchantId;
    const credentialId = req.partnerCredential.id;
    const idempotencyKey = req.headers['idempotency-key'];
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    if (!idempotencyKey) {
      return res.status(400).json({ error: { code: 'invalid_request', message: 'Idempotency-Key header is required', request_id: requestId } });
    }

    // Check idempotency
    const requestHash = partnerRepository.hashRequest(req.body);
    const existing = await partnerRepository.getIdempotencyKey(credentialId, 'create', idempotencyKey);
    if (existing) {
      if (existing.request_hash !== requestHash) {
        return res.status(409).json({ error: { code: 'idempotency_conflict', message: 'Idempotency key reused with different request body', request_id: requestId } });
      }
      if (existing.state === 'completed') {
        // Replay stored response
        const response = partnerRepository.decryptResponse(existing.response_body_encrypted);
        return res.set('Idempotent-Replayed', 'true').status(existing.http_status).json(response);
      }
      if (existing.state === 'in_progress') {
        return res.status(409).json({ error: { code: 'request_in_progress', message: 'Request with this idempotency key is still being processed', request_id: requestId } });
      }
    }

    // Create in-progress idempotency record
    await partnerRepository.upsertIdempotencyKey({
      credentialId,
      operation: 'create',
      key: idempotencyKey,
      requestHash,
      state: 'in_progress',
      expiresAt: generateIdempotencyExpiry(),
    });

    // Validate quote
    const quote = await partnerRepository.getValidQuote(merchantId, external_order_id, requestHash);
    if (!quote) {
      await partnerRepository.upsertIdempotencyKey({
        credentialId, operation: 'create', key: idempotencyKey, requestHash,
        state: 'failed_retryable', httpStatus: 422,
        responseBody: { error: { code: 'quote_expired', message: 'Quote expired, not found, or does not match request', request_id: requestId } },
        expiresAt: generateIdempotencyExpiry(),
      });
      return res.status(422).json({ error: { code: 'quote_expired', message: 'Quote expired, not found, or does not match request', request_id: requestId } });
    }

    // Validate merchant status again
    const { loadMerchantById } = require('../../lib/merchantOwner');
    const merchant = await loadMerchantById(merchantId);
    if (!merchant || merchant.status === 'suspended' || !merchant.accepting_orders) {
      return res.status(403).json({ error: { code: 'restaurant_suspended', message: 'Restaurant is suspended or not accepting orders', request_id: requestId } });
    }

    // Validate drop-off matches quote
    if (Math.abs(dropoff.lat - quote.dropoff_lat) > 0.0001 || Math.abs(dropoff.lng - quote.dropoff_lng) > 0.0001) {
      return res.status(422).json({ error: { code: 'quote_mismatch', message: 'Drop-off location does not match quote', request_id: requestId } });
    }

    // Validate preparation_status
    if (preparation_status !== 'accepted') {
      return res.status(422).json({ error: { code: 'invalid_request', message: 'preparation_status must be "accepted"', request_id: requestId } });
    }

    // Generate tracking token
    const trackingToken = generateTrackingToken();
    const trackingTokenHash = hashTrackingToken(trackingToken);
    const trackingTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Compute order totals (using food pricing logic for consistency)
    const subtotal = merchandise_total.amount_minor / 100; // convert to SAR for foodMoney
    // Use the quote's delivery fee
    const baseDeliveryFee = quote.delivery_fee_minor / 100;
    const { vatRate, vatAmount } = require('../../lib/vat').vatFor(subtotal);
    const total = subtotal + baseDeliveryFee + vatAmount;

    // Driver share
    const { driverFee } = driverShareOf(quote.delivery_fee_minor);

    // Create order + delivery + dispatch job in transaction
    const order = await partnerRepository.createPartnerOrder({
      merchantId,
      externalOrderId: external_order_id,
      quoteId: quote.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      dropoffAddress: dropoff.address,
      dropoffInstructions: dropoff.instructions || null,
      items,
      merchandiseTotalMinor: merchandise_total.amount_minor,
      merchandiseCurrency: merchandise_total.currency,
      externalPaymentStatus: external_payment.status,
      externalPaymentReference: external_payment.reference || null,
      preparationStatus: preparation_status,
      deliveryFeeMinor: quote.delivery_fee_minor,
      driverFeeMinor: driverFee,
      vatRate,
      vatAmountMinor: Math.round(vatAmount * 100),
      totalMinor: Math.round(total * 100),
      trackingTokenHash,
      trackingTokenExpiresAt,
    });

    // Consume the quote
    await partnerRepository.consumeQuote(quote.id, order.id);

    // Store completed idempotency response
    const responseBody = {
      delivery_id: order.id, // This is the order_id, we need delivery_id
      order_id: order.id,
      external_order_id: external_order_id,
      status: 'searching',
      delivery_fee: { amount_minor: quote.delivery_fee_minor, currency: 'SAR' },
      tracking_url: buildTrackingUrl(trackingToken),
      created_at: order.created_at.toISOString(),
    };

    await partnerRepository.upsertIdempotencyKey({
      credentialId,
      operation: 'create',
      key: idempotencyKey,
      requestHash,
      state: 'completed',
      httpStatus: 201,
      responseBody,
      resourceId: order.id,
      expiresAt: generateIdempotencyExpiry(),
    });

    // Audit log
    logAudit({
      actorId: credentialId,
      action: 'partner_delivery_created',
      resourceType: 'delivery',
      resourceId: order.id,
      meta: { external_order_id, merchant_id: merchantId },
    });

    return res.set('Idempotent-Replayed', 'false').status(201).json(responseBody);
  } catch (err) {
    console.error('createDelivery error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

// GET /deliveries/:id
async function getDelivery(req, res) {
  try {
    const credentialId = req.partnerCredential.id;
    const deliveryId = req.params.id;
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    const delivery = await partnerRepository.getPartnerDeliveryById(credentialId, deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Delivery not found', request_id: requestId } });
    }

    // Build response
    const response = buildDeliveryResponse(delivery);
    return res.json(response);
  } catch (err) {
    console.error('getDelivery error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

// POST /deliveries/:id/cancel
async function cancelDelivery(req, res) {
  try {
    const credentialId = req.partnerCredential.id;
    const deliveryId = req.params.id;
    const { reason } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    if (!idempotencyKey) {
      return res.status(400).json({ error: { code: 'invalid_request', message: 'Idempotency-Key header is required', request_id: requestId } });
    }

    const delivery = await partnerRepository.getPartnerDeliveryById(credentialId, deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Delivery not found', request_id: requestId } });
    }

    // Check idempotency
    const requestHash = partnerRepository.hashRequest(req.body);
    const existing = await partnerRepository.getIdempotencyKey(credentialId, 'cancel', idempotencyKey);
    if (existing) {
      if (existing.request_hash !== requestHash) {
        return res.status(409).json({ error: { code: 'idempotency_conflict', message: 'Idempotency key reused with different request body', request_id: requestId } });
      }
      if (existing.state === 'completed') {
        const response = partnerRepository.decryptResponse(existing.response_body_encrypted);
        return res.set('Idempotent-Replayed', 'true').status(existing.http_status).json(response);
      }
    }

    // State validation - can only cancel before pickup
    if (!['searching', 'assigned'].includes(delivery.status)) {
      return res.status(409).json({ error: { code: 'cancellation_not_allowed', message: `Cannot cancel delivery in status "${delivery.status}"`, request_id: requestId } });
    }

    // Cancel the order/delivery
    const { cancelOrderCore } = require('../../lib/foodOrderActions');
    const result = await cancelOrderCore({
      orderCode: delivery.order_code,
      actorId: credentialId,
      actorRole: 'partner',
      reason: reason || 'cancelled_by_partner',
      cancelledBy: 'partner',
      allowedStatuses: ['accepted', 'preparing', 'ready'], // pre-pickup
    });

    if (result.httpStatus !== 200) {
      return res.status(result.httpStatus).json(result.body);
    }

    // Store completed idempotency response
    const responseBody = {
      delivery_id: delivery.id,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    };
    await partnerRepository.upsertIdempotencyKey({
      credentialId,
      operation: 'cancel',
      key: idempotencyKey,
      requestHash,
      state: 'completed',
      httpStatus: 200,
      responseBody,
      resourceId: delivery.id,
      expiresAt: generateIdempotencyExpiry(),
    });

    logAudit({
      actorId: credentialId,
      action: 'partner_delivery_cancelled',
      resourceType: 'delivery',
      resourceId: delivery.id,
      meta: { external_order_id: delivery.external_order_id, reason },
    });

    return res.set('Idempotent-Replayed', 'false').status(200).json(responseBody);
  } catch (err) {
    console.error('cancelDelivery error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

// POST /deliveries/:id/preparation
async function updatePreparation(req, res) {
  try {
    const credentialId = req.partnerCredential.id;
    const deliveryId = req.params.id;
    const { status } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    if (!idempotencyKey) {
      return res.status(400).json({ error: { code: 'invalid_request', message: 'Idempotency-Key header is required', request_id: requestId } });
    }
    if (!['preparing', 'ready'].includes(status)) {
      return res.status(422).json({ error: { code: 'invalid_request', message: 'status must be "preparing" or "ready"', request_id: requestId } });
    }

    const delivery = await partnerRepository.getPartnerDeliveryById(credentialId, deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Delivery not found', request_id: requestId } });
    }

    // Check idempotency
    const requestHash = partnerRepository.hashRequest(req.body);
    const existing = await partnerRepository.getIdempotencyKey(credentialId, 'preparation', idempotencyKey);
    if (existing) {
      if (existing.request_hash !== requestHash) {
        return res.status(409).json({ error: { code: 'idempotency_conflict', message: 'Idempotency key reused with different request body', request_id: requestId } });
      }
      if (existing.state === 'completed') {
        const response = partnerRepository.decryptResponse(existing.response_body_encrypted);
        return res.set('Idempotent-Replayed', 'true').status(existing.http_status).json(response);
      }
    }

    // Update order status via foodOrderActions
    const { advanceOrderStatusCore } = require('../../lib/foodOrderActions');
    const result = await advanceOrderStatusCore({
      orderCode: delivery.order_code,
      actorId: credentialId,
      actorRole: 'partner',
      status,
    });

    if (result.httpStatus !== 200) {
      return res.status(result.httpStatus).json(result.body);
    }

    // Store completed idempotency response
    const responseBody = {
      delivery_id: delivery.id,
      status: delivery.status, // current delivery status (searching/assigned)
      preparation_status: status,
      updated_at: new Date().toISOString(),
    };
    await partnerRepository.upsertIdempotencyKey({
      credentialId,
      operation: 'preparation',
      key: idempotencyKey,
      requestHash,
      state: 'completed',
      httpStatus: 200,
      responseBody,
      resourceId: delivery.id,
      expiresAt: generateIdempotencyExpiry(),
    });

    return res.set('Idempotent-Replayed', 'false').status(200).json(responseBody);
  } catch (err) {
    console.error('updatePreparation error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

// POST /deliveries/:id/tracking-token/rotate
async function rotateTrackingToken(req, res) {
  try {
    const credentialId = req.partnerCredential.id;
    const deliveryId = req.params.id;
    const idempotencyKey = req.headers['idempotency-key'];
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    if (!idempotencyKey) {
      return res.status(400).json({ error: { code: 'invalid_request', message: 'Idempotency-Key header is required', request_id: requestId } });
    }

    const delivery = await partnerRepository.getPartnerDeliveryById(credentialId, deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Delivery not found', request_id: requestId } });
    }

    // Check idempotency
    const requestHash = partnerRepository.hashRequest({});
    const existing = await partnerRepository.getIdempotencyKey(credentialId, 'rotate_tracking', idempotencyKey);
    if (existing) {
      if (existing.state === 'completed') {
        const response = partnerRepository.decryptResponse(existing.response_body_encrypted);
        return res.set('Idempotent-Replayed', 'true').status(existing.http_status).json(response);
      }
    }

    // Generate new token
    const newToken = generateTrackingToken();
    const newTokenHash = hashTrackingToken(newToken);
    const newTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Update order with new token hash
    await require('../../lib/database/pool').query(
      `UPDATE public.orders SET tracking_token_hash=$1, tracking_token_expires_at=$2, tracking_token_revoked_at=now() WHERE id=$3`,
      [newTokenHash, newTokenExpiresAt, delivery.order_id]
    );

    const responseBody = {
      delivery_id: delivery.id,
      tracking_url: buildTrackingUrl(newToken),
    };
    await partnerRepository.upsertIdempotencyKey({
      credentialId,
      operation: 'rotate_tracking',
      key: idempotencyKey,
      requestHash,
      state: 'completed',
      httpStatus: 200,
      responseBody,
      resourceId: delivery.id,
      expiresAt: generateIdempotencyExpiry(),
    });

    logAudit({
      actorId: credentialId,
      action: 'partner_tracking_token_rotated',
      resourceType: 'delivery',
      resourceId: delivery.id,
      meta: { external_order_id: delivery.external_order_id },
    });

    return res.set('Idempotent-Replayed', 'false').status(200).json(responseBody);
  } catch (err) {
    console.error('rotateTrackingToken error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

function buildDeliveryResponse(delivery) {
  const substatusMap = {
    searching: delivery.order_status === 'accepted' ? 'searching' : 'searching',
    assigned: 'assigned',
    picked_up: 'picked_up',
    delivered: 'delivered',
    cancelled: 'cancelled',
  };

  return {
    delivery_id: delivery.id,
    order_id: delivery.order_id,
    external_order_id: delivery.external_order_id,
    status: delivery.status,
    substatus: substatusMap[delivery.status] || null,
    delivery_fee: { amount_minor: delivery.delivery_fee, currency: 'SAR' },
    timestamps: {
      created_at: delivery.created_at,
      assigned_at: delivery.assigned_at || null,
      picked_up_at: delivery.picked_up_at || null,
      delivered_at: delivery.delivered_at || null,
      cancelled_at: delivery.cancelled_at || null,
    },
    pickup: {
      lat: delivery.delivery_lat, // pickup is merchant location
      lng: delivery.delivery_lng,
      address: delivery.delivery_address,
      instructions: null,
    },
    dropoff: {
      lat: delivery.delivery_lat,
      lng: delivery.delivery_lng,
      address: delivery.delivery_address,
      instructions: delivery.delivery_street ? `${delivery.delivery_street} ${delivery.delivery_building || ''}`.trim() : null,
    },
    rider: delivery.driver_id ? {
      name: delivery.rider_name || null,
      vehicle_type: delivery.vehicle_type || null,
      vehicle_plate: delivery.vehicle_plate || null,
      phone: delivery.rider_mobile || null,
      whatsapp: delivery.rider_whatsapp || null,
      location: null, // would need separate query for live location
    } : null,
    cancellation_reason: delivery.reject_reason || null,
  };
}

module.exports = {
  createQuote,
  createDelivery,
  getDelivery,
  cancelDelivery,
  updatePreparation,
  rotateTrackingToken,
};
