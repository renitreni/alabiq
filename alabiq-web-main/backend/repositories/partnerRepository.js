'use strict';

const database = require('../lib/database/pool');
const { config } = require('../lib/config');
const crypto = require('crypto');

// --- Credentials -----------------------------------------------------------

async function createCredential({ merchantId, name, keyPrefix, secretHash, createdBy }) {
  const { rows } = await database.query(
    `INSERT INTO public.partner_api_credentials(merchant_id,name,key_prefix,secret_hash,created_by)
     VALUES($1,$2,$3,$4,$5) RETURNING id,merchant_id,name,key_prefix,created_at,expires_at,revoked_at,last_used_at,created_by`,
    [merchantId, name, keyPrefix, secretHash, createdBy]
  );
  return rows[0];
}

async function getCredentialByPrefix(keyPrefix) {
  const { rows } = await database.query(
    `SELECT id,merchant_id,name,key_prefix,secret_hash,created_at,expires_at,revoked_at,last_used_at,created_by
     FROM public.partner_api_credentials WHERE key_prefix=$1 LIMIT 1`,
    [keyPrefix]
  );
  return rows[0] || null;
}

async function getActiveCredentialByPrefix(keyPrefix) {
  const { rows } = await database.query(
    `SELECT id,merchant_id,name,key_prefix,secret_hash,created_at,expires_at,revoked_at,last_used_at,created_by
     FROM public.partner_api_credentials WHERE key_prefix=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
    [keyPrefix]
  );
  return rows[0] || null;
}

async function listCredentialsByMerchant(merchantId) {
  const { rows } = await database.query(
    `SELECT id,merchant_id,name,key_prefix,created_at,expires_at,revoked_at,last_used_at,created_by
     FROM public.partner_api_credentials WHERE merchant_id=$1 ORDER BY created_at DESC`,
    [merchantId]
  );
  return rows;
}

async function revokeCredential(credentialId) {
  const { rows } = await database.query(
    `UPDATE public.partner_api_credentials SET revoked_at=now() WHERE id=$1 RETURNING id`,
    [credentialId]
  );
  return rows.length > 0;
}

async function updateCredentialLastUsed(credentialId) {
  await database.query(
    `UPDATE public.partner_api_credentials SET last_used_at=now() WHERE id=$1`,
    [credentialId]
  );
}

// --- Quotes -----------------------------------------------------------------

async function createQuote({
  merchantId,
  externalOrderId,
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  dropoffAddress,
  dropoffInstructions,
  deliveryFeeMinor,
  currency,
  pricingVersion,
  requestHash,
  expiresAt,
}) {
  const { rows } = await database.query(
    `INSERT INTO public.delivery_quotes(merchant_id,external_order_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,
       dropoff_address,dropoff_instructions,delivery_fee_minor,currency,pricing_version,request_hash,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (merchant_id,external_order_id) WHERE consumed_at IS NULL
     DO UPDATE SET
       dropoff_lat=EXCLUDED.dropoff_lat,
       dropoff_lng=EXCLUDED.dropoff_lng,
       dropoff_address=EXCLUDED.dropoff_address,
       dropoff_instructions=EXCLUDED.dropoff_instructions,
       delivery_fee_minor=EXCLUDED.delivery_fee_minor,
       currency=EXCLUDED.currency,
       pricing_version=EXCLUDED.pricing_version,
       request_hash=EXCLUDED.request_hash,
       expires_at=EXCLUDED.expires_at
     RETURNING id,merchant_id,external_order_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,
       dropoff_address,dropoff_instructions,delivery_fee_minor,currency,pricing_version,request_hash,expires_at,consumed_at,consumed_by_order_id`,
    [merchantId, externalOrderId, pickupLat, pickupLng, dropoffLat, dropoffLng,
     dropoffAddress, dropoffInstructions, deliveryFeeMinor, currency, pricingVersion, requestHash, expiresAt]
  );
  return rows[0];
}

async function getValidQuote(merchantId, externalOrderId, requestHash) {
  const { rows } = await database.query(
    `SELECT id,merchant_id,external_order_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,
       dropoff_address,dropoff_instructions,delivery_fee_minor,currency,pricing_version,request_hash,expires_at,consumed_at,consumed_by_order_id
     FROM public.delivery_quotes
     WHERE merchant_id=$1 AND external_order_id=$2 AND request_hash=$3 AND consumed_at IS NULL AND expires_at > now()
     LIMIT 1`,
    [merchantId, externalOrderId, requestHash]
  );
  return rows[0] || null;
}

async function consumeQuote(quoteId, orderId) {
  const { rows } = await database.query(
    `UPDATE public.delivery_quotes SET consumed_at=now(), consumed_by_order_id=$2 WHERE id=$1 AND consumed_at IS NULL RETURNING id`,
    [quoteId, orderId]
  );
  return rows.length > 0;
}

async function deleteExpiredQuotes() {
  const { rowCount } = await database.query(
    `DELETE FROM public.delivery_quotes WHERE expires_at < now() AND consumed_at IS NULL`
  );
  return rowCount;
}

// --- Idempotency Keys -------------------------------------------------------

function hashRequest(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

async function upsertIdempotencyKey({ credentialId, operation, key, requestHash, state, httpStatus, responseBody, resourceId, expiresAt }) {
  const encrypted = responseBody ? encryptResponse(responseBody) : null;
  const { rows } = await database.query(
    `INSERT INTO public.partner_idempotency_keys(credential_id,operation,key,request_hash,state,http_status,response_body_encrypted,resource_id,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (credential_id,operation,key) DO UPDATE SET
       request_hash=EXCLUDED.request_hash,
       state=EXCLUDED.state,
       http_status=EXCLUDED.http_status,
       response_body_encrypted=EXCLUDED.response_body_encrypted,
       resource_id=EXCLUDED.resource_id,
       expires_at=EXCLUDED.expires_at
     RETURNING credential_id,operation,key,request_hash,state,http_status,response_body_encrypted,resource_id,created_at,expires_at`,
    [credentialId, operation, key, requestHash, state, httpStatus, encrypted, resourceId, expiresAt]
  );
  return rows[0];
}

async function getIdempotencyKey(credentialId, operation, key) {
  const { rows } = await database.query(
    `SELECT credential_id,operation,key,request_hash,state,http_status,response_body_encrypted,resource_id,created_at,expires_at
     FROM public.partner_idempotency_keys WHERE credential_id=$1 AND operation=$2 AND key=$3 LIMIT 1`,
    [credentialId, operation, key]
  );
  return rows[0] || null;
}

function encryptResponse(body) {
  const key = config.partnerApi.webhookSecretKey || config.appSigningKey || 'default-dev-key-change-in-prod';
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, crypto.createHash('sha256').update(key).digest(), iv);
  const plaintext = JSON.stringify(body);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function decryptResponse(encrypted) {
  const key = config.partnerApi.webhookSecretKey || config.appSigningKey || 'default-dev-key-change-in-prod';
  const algorithm = 'aes-256-gcm';
  const iv = encrypted.subarray(0, 12);
  const authTag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);
  const decipher = crypto.createDecipheriv(algorithm, crypto.createHash('sha256').update(key).digest(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function cleanupExpiredIdempotencyKeys() {
  const retentionMs = config.partnerApi.idempotencyRetentionHours * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - retentionMs);
  const { rowCount } = await database.query(
    `DELETE FROM public.partner_idempotency_keys WHERE created_at < $1 AND state != 'in_progress'`,
    [cutoff]
  );
  return rowCount;
}

// --- Orders (partner-sourced) ----------------------------------------------

async function createPartnerOrder({
  merchantId,
  externalOrderId,
  quoteId,
  customerName,
  customerPhone,
  dropoffLat,
  dropoffLng,
  dropoffAddress,
  dropoffInstructions,
  items,
  merchandiseTotalMinor,
  merchandiseCurrency,
  externalPaymentStatus,
  externalPaymentReference,
  preparationStatus,
  deliveryFeeMinor,
  driverFeeMinor,
  vatRate,
  vatAmountMinor,
  totalMinor,
  trackingTokenHash,
  trackingTokenExpiresAt,
}) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');

    // Insert order
    const { rows: orderRows } = await client.query(
      `INSERT INTO public.orders(
         merchant_id, source, external_order_id, payment_collection, payment_method, payment_status,
         customer_name, customer_mobile, delivery_address, delivery_lat, delivery_lng,
         delivery_street, delivery_building, contact_phone,
         subtotal, delivery_fee, delivery_surcharge, platform_margin_total, vat_rate, vat_amount, total,
         distance_km, status, tracking_token_hash, tracking_token_expires_at, idempotency_response_encrypted
       ) VALUES($1,'restaurant_partner',$2,'restaurant','external','paid',
         $3,$4,$5,$6,$7,$8,$9,$4,
         $10,$11,$12,$13,$14,$15,$16,$17,'accepted',$18,$19,$20)
       RETURNING id,order_code,merchant_id,status,created_at`,
      [merchantId, externalOrderId, customerName, customerPhone, dropoffAddress,
       dropoffLat, dropoffLng, dropoffInstructions || null, null,
       merchandiseTotalMinor, deliveryFeeMinor, 0, 0, vatRate, vatAmountMinor, totalMinor,
       0, // distance_km - will compute
       trackingTokenHash, trackingTokenExpiresAt, null]
    );
    const order = orderRows[0];

    // Insert order items
    for (const item of items) {
      await client.query(
        `INSERT INTO public.order_items(order_id,menu_item_id,name_snapshot,size_snapshot,quantity,unit_price,line_total)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, null, item.name, null, item.quantity, 0, 0] // prices snapshotted elsewhere
      );
    }

    // Insert delivery
    await client.query(
      `INSERT INTO public.deliveries(order_id,merchant_id,status,driver_fee)
       VALUES($1,$2,'searching',$3)`,
      [order.id, merchantId, driverFeeMinor]
    );

    // Insert background job for dispatch
    await client.query(
      `INSERT INTO public.background_jobs(kind,dedup_key,payload,run_at)
       VALUES('partner_dispatch',$1,$2,now())
       ON CONFLICT (kind,dedup_key) DO NOTHING`,
      [`dispatch:${order.id}`, JSON.stringify({ orderId: order.id, source: 'restaurant_partner' })]
    );

    await client.query('COMMIT');
    return order;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getPartnerDeliveryById(credentialId, deliveryId) {
  // First get the merchant_id from the credential
  const { rows: credRows } = await database.query(
    `SELECT merchant_id FROM public.partner_api_credentials WHERE id=$1 LIMIT 1`,
    [credentialId]
  );
  if (!credRows.length) return null;
  const merchantId = credRows[0].merchant_id;

  const { rows } = await database.query(
    `SELECT d.id,d.order_id,d.merchant_id,d.status,d.driver_id,d.driver_fee,d.pickup_photo_path,d.delivery_photo_path,
       d.created_at,d.assigned_at,d.picked_up_at,d.delivered_at,d.cancelled_at,
       o.order_code,o.external_order_id,o.customer_name,o.customer_mobile,o.delivery_address,
       o.delivery_lat,o.delivery_lng,o.delivery_street,o.delivery_building,o.contact_phone,
       o.subtotal,o.delivery_fee,o.delivery_surcharge,o.platform_margin_total,o.vat_rate,o.vat_amount,o.total,
       o.payment_status,o.payment_method,o.external_payment_reference,o.status as order_status,
       o.accepted_at,o.ready_at,o.delivered_at as order_delivered_at,o.reject_reason,o.cancelled_by,o.cancelled_at
     FROM public.deliveries d
     JOIN public.orders o ON o.id=d.order_id
     WHERE d.id=$1 AND o.merchant_id=$2 AND o.source='restaurant_partner'
     LIMIT 1`,
    [deliveryId, merchantId]
  );
  return rows[0] || null;
}

async function getPartnerDeliveryByExternalOrderId(credentialId, externalOrderId) {
  const { rows: credRows } = await database.query(
    `SELECT merchant_id FROM public.partner_api_credentials WHERE id=$1 LIMIT 1`,
    [credentialId]
  );
  if (!credRows.length) return null;
  const merchantId = credRows[0].merchant_id;

  const { rows } = await database.query(
    `SELECT d.id,d.order_id,d.merchant_id,d.status,d.driver_id,d.driver_fee,d.pickup_photo_path,d.delivery_photo_path,
       d.created_at,d.assigned_at,d.picked_up_at,d.delivered_at,d.cancelled_at,
       o.order_code,o.external_order_id,o.customer_name,o.customer_mobile,o.delivery_address,
       o.delivery_lat,o.delivery_lng,o.delivery_street,o.delivery_building,o.contact_phone,
       o.subtotal,o.delivery_fee,o.delivery_surcharge,o.platform_margin_total,o.vat_rate,o.vat_amount,o.total,
       o.payment_status,o.payment_method,o.external_payment_reference,o.status as order_status,
       o.accepted_at,o.ready_at,o.delivered_at as order_delivered_at,o.reject_reason,o.cancelled_by,o.cancelled_at
     FROM public.deliveries d
     JOIN public.orders o ON o.id=d.order_id
     WHERE o.external_order_id=$1 AND o.merchant_id=$2 AND o.source='restaurant_partner'
     LIMIT 1`,
    [externalOrderId, merchantId]
  );
  return rows[0] || null;
}

// --- Webhooks ---------------------------------------------------------------

async function createWebhookEndpoint({ merchantId, url, secretEncrypted, events }) {
  const { rows } = await database.query(
    `INSERT INTO public.partner_webhook_endpoints(merchant_id,url,secret_encrypted,events)
     VALUES($1,$2,$3,$4) RETURNING *`,
    [merchantId, url, secretEncrypted, events]
  );
  return rows[0];
}

async function getWebhookEndpoints(merchantId) {
  const { rows } = await database.query(
    `SELECT * FROM public.partner_webhook_endpoints WHERE merchant_id=$1 AND is_active=true ORDER BY created_at`,
    [merchantId]
  );
  return rows;
}

async function updateWebhookEndpoint(endpointId, { url, secretEncrypted, events, isActive }) {
  const sets = [];
  const vals = [];
  let idx = 1;
  if (url !== undefined) { sets.push(`url=$${idx++}`); vals.push(url); }
  if (secretEncrypted !== undefined) { sets.push(`secret_encrypted=$${idx++}`); vals.push(secretEncrypted); }
  if (events !== undefined) { sets.push(`events=$${idx++}`); vals.push(events); }
  if (isActive !== undefined) { sets.push(`is_active=$${idx++}`); vals.push(isActive); }
  sets.push(`updated_at=now()`);
  vals.push(endpointId);
  if (sets.length === 1) return null; // only updated_at
  const { rows } = await database.query(
    `UPDATE public.partner_webhook_endpoints SET ${sets.join(',')} WHERE id=$${idx} RETURNING *`,
    vals
  );
  return rows[0] || null;
}

async function deleteWebhookEndpoint(endpointId, merchantId) {
  const { rowCount } = await database.query(
    `DELETE FROM public.partner_webhook_endpoints WHERE id=$1 AND merchant_id=$2`,
    [endpointId, merchantId]
  );
  return rowCount > 0;
}

async function enqueueWebhookDelivery({ endpointId, eventType, deliveryId, payload, sequence }) {
  const { rows } = await database.query(
    `INSERT INTO public.partner_webhook_deliveries(endpoint_id,event_type,delivery_id,payload,sequence)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [endpointId, eventType, deliveryId, payload, sequence]
  );
  return rows[0];
}

async function getPendingWebhookDeliveries(limit = 100) {
  const { rows } = await database.query(
    `SELECT wd.*, we.url, we.secret_encrypted, we.events
     FROM public.partner_webhook_deliveries wd
     JOIN public.partner_webhook_endpoints we ON we.id=wd.endpoint_id
     WHERE wd.completed_at IS NULL AND we.is_active=true AND wd.next_attempt_at <= now()
     ORDER BY wd.next_attempt_at
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function updateWebhookDeliveryAttempt(deliveryId, { attempt, status, error, completed }) {
  const sets = ['attempt=$2', 'last_status=$3', 'last_error=$4'];
  const vals = [deliveryId, attempt, status, error];
  let idx = 5;
  if (completed) {
    sets.push('completed_at=now()');
  } else {
    // exponential backoff with jitter: min(2^attempt * 60s, 3600s) + random(0-30s)
    const baseDelay = Math.min(Math.pow(2, attempt) * 60, 3600);
    const jitter = Math.random() * 30;
    const nextAttempt = new Date(Date.now() + (baseDelay + jitter) * 1000);
    sets.push(`next_attempt_at=$${idx++}`);
    vals.push(nextAttempt);
  }
  const { rows } = await database.query(
    `UPDATE public.partner_webhook_deliveries SET ${sets.join(',')} WHERE id=$1 RETURNING *`,
    vals
  );
  return rows[0] || null;
}

// --- Background Jobs --------------------------------------------------------

async function claimBackgroundJobs(workerId, kinds, limit = 10) {
  const placeholders = kinds.map((_, i) => `$${i + 2}`).join(',');
  const { rows } = await database.query(
    `UPDATE public.background_jobs
     SET lease_owner=$1, lease_expires_at=now() + ($${kinds.length + 2} || ' seconds')::interval,
         attempts=attempts+1
     WHERE id IN (
       SELECT id FROM public.background_jobs
       WHERE kind IN (${placeholders})
         AND completed_at IS NULL
         AND run_at <= now()
         AND (lease_owner IS NULL OR lease_expires_at <= now())
       ORDER BY run_at
       FOR UPDATE SKIP LOCKED
       LIMIT $${kinds.length + 3}
     )
     RETURNING *`,
    [workerId, ...kinds, 30, limit]
  );
  return rows;
}

async function completeBackgroundJob(jobId, workerId) {
  const { rows } = await database.query(
    `UPDATE public.background_jobs SET completed_at=now(), lease_owner=NULL, lease_expires_at=NULL
     WHERE id=$1 AND lease_owner=$2 RETURNING *`,
    [jobId, workerId]
  );
  return rows[0] || null;
}

async function failBackgroundJob(jobId, workerId, error, maxAttempts) {
  const { rows } = await database.query(
    `UPDATE public.background_jobs SET last_error=$3, lease_owner=NULL, lease_expires_at=NULL,
       run_at=now() + (LEAST(POW(2, attempts) * 60, 3600) || ' seconds')::interval
     WHERE id=$1 AND lease_owner=$2 AND attempts < $4 RETURNING *`,
    [jobId, workerId, error, maxAttempts]
  );
  return rows[0] || null;
}

async function getStaleLeases(workerId, maxAgeSeconds = 60) {
  const { rows } = await database.query(
    `UPDATE public.background_jobs SET lease_owner=NULL, lease_expires_at=NULL
     WHERE lease_owner=$1 AND lease_expires_at < now() - ($2 || ' seconds')::interval
     RETURNING *`,
    [workerId, maxAgeSeconds]
  );
  return rows;
}

module.exports = {
  createCredential,
  getCredentialByPrefix,
  getActiveCredentialByPrefix,
  listCredentialsByMerchant,
  revokeCredential,
  updateCredentialLastUsed,
  createQuote,
  getValidQuote,
  consumeQuote,
  deleteExpiredQuotes,
  upsertIdempotencyKey,
  getIdempotencyKey,
  hashRequest,
  cleanupExpiredIdempotencyKeys,
  encryptResponse,
  decryptResponse,
  createPartnerOrder,
  getPartnerDeliveryById,
  getPartnerDeliveryByExternalOrderId,
  createWebhookEndpoint,
  getWebhookEndpoints,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  enqueueWebhookDelivery,
  getPendingWebhookDeliveries,
  updateWebhookDeliveryAttempt,
  claimBackgroundJobs,
  completeBackgroundJob,
  failBackgroundJob,
  getStaleLeases,
};
