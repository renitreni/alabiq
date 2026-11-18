#!/usr/bin/env node
// Load smoke test for partner API quotes + create
// Fires N concurrent quote+create pairs, asserts zero duplicate orders, zero 5xx, p95 latency < 500ms

'use strict';

require('dotenv').config();

const crypto = require('crypto');

const API_BASE = process.env.API_BASE || 'http://localhost:4001';
const MERCHANT_ID = process.env.TEST_MERCHANT_ID;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '50', 10);

async function fetchJson(path, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body, latency: Date.now() - start };
  } catch (err) {
    return { status: 0, body: { error: err.message }, latency: Date.now() - start };
  }
}

function generateIdempotencyKey() {
  return crypto.randomBytes(16).toString('hex');
}

async function runSingleTest(credential, index) {
  const { keyPrefix, secret } = credential;
  const externalOrderId = `load-${Date.now()}-${index}-${crypto.randomBytes(4).toString('hex')}`;
  const dropoff = { lat: 24.7136, lng: 46.6753, address: 'Load Test Address, Riyadh' };
  const items = [{ name: 'Load Test Meal', quantity: 1, unit_price_minor: 3000 }];
  const merchandise_total = { amount_minor: 3000, currency: 'SAR' };

  // 1. Create quote
  const quoteRes = await fetchJson('/api/partner/deliveries/quote', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${keyPrefix}:${secret}`, 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({ external_order_id: externalOrderId, dropoff, items, merchandise_total }),
  });

  if (quoteRes.status !== 201) {
    return { success: false, error: `Quote failed: ${quoteRes.status}`, latency: quoteRes.latency, quoteLatency: quoteRes.latency };
  }

  const quote = quoteRes.body;
  
  // 2. Create delivery
  const createRes = await fetchJson('/api/partner/deliveries', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${keyPrefix}:${secret}`, 'Idempotency-Key': generateIdempotencyKey() },
    body: JSON.stringify({
      external_order_id: externalOrderId,
      quote_id: quote.quote_id,
      customer: { name: `Load Customer ${index}`, phone: '+966501234567' },
      dropoff,
      items,
      merchandise_total,
      external_payment: { status: 'paid', reference: `ext-${index}` },
      preparation_status: 'accepted',
    }),
  });

  const success = createRes.status === 201;
  const is5xx = createRes.status >= 500;
  
  return {
    success,
    is5xx,
    latency: createRes.latency,
    quoteLatency: quoteRes.latency,
    totalLatency: quoteRes.latency + createRes.latency,
    orderId: createRes.body?.order_id,
    error: success ? null : `Create failed: ${createRes.status} - ${JSON.stringify(createRes.body)}`,
  };
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function run() {
  if (!MERCHANT_ID) {
    console.error('ERROR: TEST_MERCHANT_ID environment variable required');
    process.exit(1);
  }

  console.log('=== Partner API Load Test ===');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Merchant ID: ${MERCHANT_ID}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  // Create a single credential for all tests
  const { fetchJson: f } = await import('./check-partner-flow.js').catch(() => ({}));
  // We'll just create one inline
  const crypto = require('crypto');
  
  // First create credential via API
  const credRes = await fetchJson('/api/partner/credentials', {
    method: 'POST',
    body: JSON.stringify({ name: 'Load Test Credential' }),
  });

  if (credRes.status !== 201 && credRes.status !== 409) {
    console.error('Failed to create credential:', credRes.body);
    process.exit(1);
  }

  const credential = credRes.body.credential || credRes.body;
  console.log(`Credential: ${credential.key_prefix}\n`);

  // Run concurrent tests
  console.log(`Running ${CONCURRENCY} concurrent quote+create pairs...`);
  const promises = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    promises.push(runSingleTest(credential, i));
  }

  const results = await Promise.all(promises);

  // Analyze results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const errors5xx = results.filter(r => r.is5xx);
  const latencies = results.map(r => r.totalLatency).filter(l => l > 0);
  const quoteLatencies = results.map(r => r.quoteLatency).filter(l => l > 0);
  const createLatencies = results.map(r => r.latency).filter(l => l > 0);

  const orderIds = results.map(r => r.orderId).filter(Boolean);
  const uniqueOrderIds = new Set(orderIds);
  
  console.log('\n=== RESULTS ===');
  console.log(`Total requests: ${CONCURRENCY}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`5xx errors: ${errors5xx.length}`);
  console.log(`Orders created: ${orderIds.length}`);
  console.log(`Unique order IDs: ${uniqueOrderIds.size}`);
  console.log(`Duplicate orders: ${orderIds.length - uniqueOrderIds.size}`);
  
  if (latencies.length > 0) {
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);
    console.log(`\nTotal Latency (quote+create):`);
    console.log(`  Avg: ${avg.toFixed(2)}ms`);
    console.log(`  p50: ${p50}ms`);
    console.log(`  p95: ${p95}ms`);
    console.log(`  p99: ${p99}ms`);
  }

  if (quoteLatencies.length > 0) {
    const avg = quoteLatencies.reduce((a, b) => a + b, 0) / quoteLatencies.length;
    console.log(`\nQuote Latency: avg ${avg.toFixed(2)}ms`);
  }

  if (createLatencies.length > 0) {
    const avg = createLatencies.reduce((a, b) => a + b, 0) / createLatencies.length;
    console.log(`Create Latency: avg ${avg.toFixed(2)}ms`);
  }

  // Assertions
  let exitCode = 0;
  
  if (errors5xx.length > 0) {
    console.error(`\nFAIL: ${errors5xx.length} 5xx errors`);
    exitCode = 1;
  }

  if (orderIds.length !== uniqueOrderIds.size) {
    console.error(`\nFAIL: ${orderIds.length - uniqueOrderIds.size} duplicate orders detected`);
    exitCode = 1;
  }

  const p95Latency = percentile(latencies, 95);
  if (p95Latency > 500) {
    console.error(`\nFAIL: p95 latency ${p95Latency}ms exceeds 500ms threshold`);
    exitCode = 1;
  } else {
    console.log(`\nPASS: p95 latency ${p95Latency}ms <= 500ms`);
  }

  if (exitCode === 0) {
    console.log('\n=== ALL LOAD TEST CHECKS PASSED ===');
  }

  process.exit(exitCode);
}

run().catch(err => {
  console.error('Load test failed with error:', err);
  process.exit(1);
});
