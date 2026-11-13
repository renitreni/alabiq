#!/usr/bin/env node
// Integration test for partner API flow
'use strict';

require('dotenv').config();

const crypto = require('crypto');
const { createPool } = require('../lib/database/pool');

const API_BASE = process.env.API_BASE || 'http://localhost:4001';
const MERCHANT_ID = process.env.TEST_MERCHANT_ID;

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
}

function generateIdempotencyKey() {
  return crypto.randomBytes(16).toString('hex');
}

async function run() {
  if (!MERCHANT_ID) {
    console.error('ERROR: TEST_MERCHANT_ID environment variable required');
    process.exit(1);
  }

  console.log('=== Partner API Integration Test ===');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Merchant ID: ${MERCHANT_ID}\n`);

  // 1. Create a partner credential
  console.log('1. Creating partner credential...');
  const credentialRes = await fetchJson('/api/partner/credentials', {
    method: 'POST',
    body: JSON.stringify({ name: 'Integration Test Credential' }),
  });

  if (credentialRes.status !== 201 && credentialRes.status !== 409) {
    console.error('Failed to create credential:', credentialRes.body);
    process.exit(1);
  }

  const credential = credentialRes.body.credential || credentialRes.body;
  const keyPrefix = credential.key_prefix;
  const secret = credential.secret;
  console.log(`   Credential created: ${keyPrefix}`);

  // 2. Create a quote
  console.log('\n2. Creating delivery quote...');
  const externalOrderId = `test-${Date.now()}`;
  const dropoff = {
    lat: 24.7136,
    lng: 46.6753,
    address: 'Test Address, Riyadh',
    instructions: 'Near landmark',
  };

  const quoteRes = await fetchJson('/api/partner/deliveries/quote', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${keyPrefix}:${secret}`,
      'Idempotency-Key': generateIdempotencyKey(),
    },
    body: JSON.stringify({
      external_order_id: externalOrderId,
      dropoff,
      items: [{ name: 'Test Meal', quantity: 2, unit_price_minor: 2500 }],
      merchandise_total: { amount_minor: 5000, currency: 'SAR' },
    }),
  });

  if (quoteRes.status !== 201) {
    console.error('Failed to create quote:', quoteRes.body);
    process.exit(1);
  }

  const quote = quoteRes.body;
  console.log(`   Quote created: ${quote.quote_id}`);
  console.log(`   Delivery fee: ${quote.delivery_fee.amount_minor / 100} SAR`);
  console.log(`   Distance: ${quote.distance_km} km`);

  // 3. Create delivery from quote
  console.log('\n3. Creating delivery from quote...');
  const idempotencyKey = generateIdempotencyKey();
  const createRes = await fetchJson('/api/partner/deliveries', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${keyPrefix}:${secret}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      external_order_id: externalOrderId,
      quote_id: quote.quote_id,
      customer: { name: 'Test Customer', phone: '+966501234567' },
      dropoff,
      items: [{ name: 'Test Meal', quantity: 2, unit_price_minor: 2500 }],
      merchandise_total: { amount_minor: 5000, currency: 'SAR' },
      external_payment: { status: 'paid', reference: 'ext-pay-123' },
      preparation_status: 'accepted',
    }),
  });

  if (createRes.status !== 201) {
    console.error('Failed to create delivery:', createRes.body);
    process.exit(1);
  }

  const delivery = createRes.body;
  console.log(`   Delivery created: ${delivery.delivery_id}`);
  console.log(`   Order ID: ${delivery.order_id}`);

  // 4. Verify stored order in database
  console.log('\n4. Verifying stored order in database...');
  const pool = createPool();
  try {
    const { rows } = await pool.query(`SELECT * FROM public.orders WHERE id = $1`, [delivery.order_id]);
    if (rows.length === 0) {
      console.error('ERROR: Order not found in database');
      process.exit(1);
    }

    const order = rows[0];
    console.log(`   Order found: ${order.order_code}`);

    const expectedSubtotal = 50.00;
    const expectedDeliveryFee = quote.delivery_fee.amount_minor / 100;
    const expectedVat = Math.round(expectedSubtotal * 0.15 * 100) / 100;
    const expectedTotal = expectedSubtotal + expectedDeliveryFee + expectedVat;

    console.log(`   Subtotal: ${order.subtotal} (expected ${expectedSubtotal})`);
    console.log(`   Delivery Fee: ${order.delivery_fee} (expected ${expectedDeliveryFee})`);
    console.log(`   VAT: ${order.vat_amount} (expected ${expectedVat})`);
    console.log(`   Total: ${order.total} (expected ${expectedTotal})`);

    const tolerance = 0.01;
    if (Math.abs(Number(order.subtotal) - expectedSubtotal) > tolerance) {
      console.error(`FAIL: subtotal mismatch: ${order.subtotal} !== ${expectedSubtotal}`);
      process.exit(1);
    }
    if (Math.abs(Number(order.delivery_fee) - expectedDeliveryFee) > tolerance) {
      console.error(`FAIL: delivery_fee mismatch: ${order.delivery_fee} !== ${expectedDeliveryFee}`);
      process.exit(1);
    }
    if (Math.abs(Number(order.vat_amount) - expectedVat) > tolerance) {
      console.error(`FAIL: vat_amount mismatch: ${order.vat_amount} !== ${expectedVat}`);
      process.exit(1);
    }
    if (Math.abs(Number(order.total) - expectedTotal) > tolerance) {
      console.error(`FAIL: total mismatch: ${order.total} !== ${expectedTotal}`);
      process.exit(1);
    }

    if (order.distance_km !== quote.distance_km) {
      console.error(`FAIL: distance_km mismatch: ${order.distance_km} !== ${quote.distance_km}`);
      process.exit(1);
    }
    console.log(`   Distance: ${order.distance_km} km (matches quote)`);

    if (order.payment_method !== 'external') {
      console.error(`FAIL: payment_method should be 'external', got '${order.payment_method}'`);
      process.exit(1);
    }
    console.log(`   Payment method: ${order.payment_method} (correct)`);

    if (order.source !== 'restaurant_partner') {
      console.error(`FAIL: source should be 'restaurant_partner', got '${order.source}'`);
      process.exit(1);
    }
    console.log(`   Source: ${order.source} (correct)`);

    // Verify order items
    const { rows: items } = await pool.query(`SELECT * FROM public.order_items WHERE order_id = $1`, [delivery.order_id]);
    console.log(`   Order items: ${items.length}`);
    for (const item of items) {
      console.log(`     - ${item.name}: qty=${item.quantity}, unit_price=${item.unit_price}, line_total=${item.line_total}`);
    }

    // Verify delivery record
    const { rows: deliveries } = await pool.query(`SELECT * FROM public.deliveries WHERE order_id = $1`, [delivery.order_id]);
    if (deliveries.length === 0) {
      console.error('FAIL: Delivery record not found');
      process.exit(1);
    }
    console.log(`   Delivery record: status=${deliveries[0].status}, driver_fee=${deliveries[0].driver_fee}`);

    if (!order.tracking_token_hash || !order.tracking_token_expires_at) {
      console.error('FAIL: Tracking token not set');
      process.exit(1);
    }
    console.log(`   Tracking token: set (expires ${order.tracking_token_expires_at})`);

    // 5. Verify idempotency replay works
    console.log('\n5. Testing idempotency replay...');
    const replayRes = await fetchJson('/api/partner/deliveries', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keyPrefix}:${secret}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        external_order_id: externalOrderId,
        quote_id: quote.quote_id,
        customer: { name: 'Test Customer', phone: '+966501234567' },
        dropoff,
        items: [{ name: 'Test Meal', quantity: 2, unit_price_minor: 2500 }],
        merchandise_total: { amount_minor: 5000, currency: 'SAR' },
        external_payment: { status: 'paid', reference: 'ext-pay-123' },
        preparation_status: 'accepted',
      }),
    });

    if (replayRes.status !== 201 || replayRes.headers.get('idempotent-replayed') !== 'true') {
      console.error('FAIL: Idempotency replay failed', replayRes.body);
      process.exit(1);
    }
    console.log('   Idempotency replay works correctly');

    console.log('\n=== ALL CHECKS PASSED ===');
    process.exit(0);
  } finally {
    await pool.end();
  }
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
