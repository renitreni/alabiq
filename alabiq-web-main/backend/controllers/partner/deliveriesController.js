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

// --- Credentials --------------------------------------------------------------

async function listCredentials(req, res) {
  try {
    const credentials = await partnerRepository.listCredentialsByMerchant(req.merchantId);
    const safe = credentials.map(c => ({
      id: c.id,
      name: c.name,
      key_prefix: c.key_prefix,
      created_at: c.created_at,
      expires_at: c.expires_at,
      revoked_at: c.revoked_at,
      last_used_at: c.last_used_at,
      created_by: c.created_by,
    }));
    return res.json({ credentials: safe });
  } catch (err) {
    console.error('listCredentials error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function createCredential(req, res) {
  try {
    const { name, expires_at } = req.body || {};
    if (!name || typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({ error: { code: 'invalid_name', message: 'Credential name is required (max 100 chars)' } });
    }
    const crypto = require('crypto');
    const keyPrefix = 'ak_live_' + crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(24).toString('base64url');
    const { hashPassword } = require('../lib/passwords');
    const secretHash = await hashPassword(secret);
    const expiresAt = expires_at ? new Date(expires_at) : null;
    if (expiresAt && isNaN(expiresAt.getTime())) {
      return res.status(400).json({ error: { code: 'invalid_expiry', message: 'expires_at must be a valid ISO 8601 timestamp' } });
    }
    const credential = await partnerRepository.createCredential({
      merchantId: req.merchantId,
      name,
      keyPrefix,
      secretHash,
      createdBy: req.userId,
    });
    return res.status(201).json({
      credential: {
        id: credential.id,
        name: credential.name,
        key_prefix: credential.key_prefix,
        created_at: credential.created_at,
        expires_at: credential.expires_at,
        revoked_at: credential.revoked_at,
        last_used_at: credential.last_used_at,
        created_by: credential.created_by,
      },
      secret,
    });
  } catch (err) {
    console.error('createCredential error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

// --- Credentials (cont.) ------------------------------------------------------

async function revokeCredential(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Credential ID is required' } });
    const creds = await partnerRepository.listCredentialsByMerchant(req.merchantId);
    const cred = creds.find(c => c.id === id);
    if (!cred) return res.status(404).json({ error: { code: 'not_found', message: 'Credential not found' } });
    await partnerRepository.revokeCredential(id);
    return res.json({ revoked: true });
  } catch (err) {
    console.error('revokeCredential error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

// --- Credentials (cont.) ------------------------------------------------------

async function rotateCredential(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Credential ID is required' } });
    const creds = await partnerRepository.listCredentialsByMerchant(req.merchantId);
    const cred = creds.find(c => c.id === id);
    if (!cred) return res.status(404).json({ error: { code: 'not_found', message: 'Credential not found' } });
    await partnerRepository.revokeCredential(id);
    const crypto = require('crypto');
    const keyPrefix = 'ak_live_' + crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(24).toString('base64url');
    const { hashPassword } = require('../lib/passwords');
    const secretHash = await hashPassword(secret);
    const newCred = await partnerRepository.createCredential({
      merchantId: req.merchantId,
      name: cred.name + ' (rotated)',
      keyPrefix,
      secretHash,
      createdBy: req.userId,
    });
    return res.status(201).json({
      credential: {
        id: newCred.id,
        name: newCred.name,
        key_prefix: newCred.key_prefix,
        created_at: newCred.created_at,
        expires_at: newCred.expires_at,
        revoked_at: newCred.revoked_at,
        last_used_at: newCred.last_used_at,
        created_by: newCred.created_by,
      },
      secret,
    });
  } catch (err) {
    console.error('rotateCredential error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

// --- Webhook Endpoints --------------------------------------------------------

async function listWebhookEndpoints(req, res) {
  try {
    const endpoints = await partnerRepository.getWebhookEndpoints(req.merchantId);
    return res.json({ endpoints });
  } catch (err) {
    console.error('listWebhookEndpoints error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function createWebhookEndpoint(req, res) {
  try {
    const { url, events, is_active } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: { code: 'invalid_url', message: 'Webhook URL is required' } });
    }
    const { isValidWebhookUrl } = require('../../worker');
    const urlValidation = isValidWebhookUrl(url);
    if (!urlValidation.valid) {
      return res.status(400).json({ error: { code: 'invalid_url', message: urlValidation.reason } });
    }
    const eventList = Array.isArray(events) && events.length > 0 ? events : [
      'delivery.searching', 'delivery.rider_assigned', 'delivery.picked_up',
      'delivery.delivered', 'delivery.cancelled', 'delivery.search_exhausted'
    ];
    const endpoint = await partnerRepository.createWebhookEndpoint({
      merchantId: req.merchantId,
      url,
      events: eventList,
      isActive: is_active !== false,
    });
    return res.status(201).json({ endpoint });
  } catch (err) {
    console.error('createWebhookEndpoint error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function updateWebhookEndpoint(req, res) {
  try {
    const { id } = req.params;
    const { url, events, is_active } = req.body || {};
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Endpoint ID is required' } });
    if (url) {
      const { isValidWebhookUrl } = require('../../worker');
      const urlValidation = isValidWebhookUrl(url);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: { code: 'invalid_url', message: urlValidation.reason } });
      }
    }
    const updates = {};
    if (url !== undefined) updates.url = url;
    if (events !== undefined) updates.events = events;
    if (is_active !== undefined) updates.is_active = is_active;
    const endpoint = await partnerRepository.updateWebhookEndpoint(id, req.merchantId, updates);
    if (!endpoint) return res.status(404).json({ error: { code: 'not_found', message: 'Webhook endpoint not found' } });
    return res.json({ endpoint });
  } catch (err) {
    console.error('updateWebhookEndpoint error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function deleteWebhookEndpoint(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Endpoint ID is required' } });
    const deleted = await partnerRepository.deleteWebhookEndpoint(id, req.merchantId);
    if (!deleted) return res.status(404).json({ error: { code: 'not_found', message: 'Webhook endpoint not found' } });
    return res.json({ deleted: true });
  } catch (err) {
    console.error('deleteWebhookEndpoint error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function getWebhookDeliveries(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Endpoint ID is required' } });
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const deliveries = await partnerRepository.getWebhookDeliveries(id, req.merchantId, limit, offset);
    return res.json({ deliveries });
  } catch (err) {
    console.error('getWebhookDeliveries error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function replayWebhookDelivery(req, res) {
  try {
    const { id, deliveryId } = req.params;
    if (!id || !deliveryId) return res.status(400).json({ error: { code: 'missing_id', message: 'Endpoint ID and Delivery ID are required' } });
    const deliveries = await partnerRepository.getWebhookDeliveries(id, req.merchantId, 1, 0);
    const delivery = deliveries.find(d => d.id === deliveryId);
    if (!delivery) return res.status(404).json({ error: { code: 'not_found', message: 'Webhook delivery not found' } });
    await partnerRepository.enqueueWebhookDelivery({
      endpointId: id,
      eventType: delivery.event_type,
      deliveryId: delivery.delivery_id,
      payload: delivery.payload,
      sequence: delivery.sequence,
    });
    return res.json({ replay_queued: true });
  } catch (err) {
    console.error('replayWebhookDelivery error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

module.exports = {
  createQuote,
  createDelivery,
  getDelivery,
  cancelDelivery,
  updatePreparation,
  rotateTrackingToken,
  // Credentials
  listCredentials,
  createCredential,
  revokeCredential,
  rotateCredential,
  // Webhook endpoints
  listWebhookEndpoints,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookDeliveries,
  replayWebhookDelivery,
};
