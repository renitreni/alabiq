'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// Mock the database pool before requiring the repository
const mockQuery = async (sql, params) => ({ rows: [], rowCount: 0 });

const originalPool = require('../lib/database/pool');
require('../lib/database/pool').query = mockQuery;

const partnerRepository = require('../repositories/partnerRepository');

test('partnerRepository exports expected functions', () => {
  const expected = [
    'createCredential',
    'getCredentialByPrefix',
    'getActiveCredentialByPrefix',
    'listCredentialsByMerchant',
    'revokeCredential',
    'updateCredentialLastUsed',
    'createQuote',
    'getValidQuote',
    'consumeQuote',
    'deleteExpiredQuotes',
    'upsertIdempotencyKey',
    'getIdempotencyKey',
    'hashRequest',
    'cleanupExpiredIdempotencyKeys',
    'encryptResponse',
    'decryptResponse',
    'createPartnerOrder',
    'getPartnerDeliveryById',
    'getPartnerDeliveryByExternalOrderId',
    'createWebhookEndpoint',
    'getWebhookEndpoints',
    'updateWebhookEndpoint',
    'deleteWebhookEndpoint',
    'enqueueWebhookDelivery',
    'getPendingWebhookDeliveries',
    'updateWebhookDeliveryAttempt',
    'claimBackgroundJobs',
    'completeBackgroundJob',
    'failBackgroundJob',
    'getStaleLeases',
  ];
  for (const fn of expected) {
    assert.strictEqual(typeof partnerRepository[fn], 'function', `Missing function: ${fn}`);
  }
});

test('hashRequest produces consistent SHA256', () => {
  const body = { external_order_id: 'test-123', dropoff: { lat: 24.7, lng: 46.6, address: 'Test' } };
  const hash1 = partnerRepository.hashRequest(body);
  const hash2 = partnerRepository.hashRequest(body);
  assert.strictEqual(hash1, hash2);
  assert.strictEqual(hash1.length, 64); // hex encoded sha256
});

test('hashRequest differs for different bodies', () => {
  const hash1 = partnerRepository.hashRequest({ a: 1 });
  const hash2 = partnerRepository.hashRequest({ a: 2 });
  assert.notStrictEqual(hash1, hash2);
});

test('encryptResponse/decryptResponse roundtrip', () => {
  const body = { delivery_id: 'abc', tracking_url: 'https://example.com/track/xyz' };
  const encrypted = partnerRepository.encryptResponse(body);
  assert.ok(Buffer.isBuffer(encrypted));
  assert.ok(encrypted.length > 0);
  const decrypted = partnerRepository.decryptResponse(encrypted);
  assert.deepStrictEqual(decrypted, body);
});

test('decryptResponse fails on tampered data', () => {
  const body = { test: 'data' };
  const encrypted = partnerRepository.encryptResponse(body);
  // Tamper with the ciphertext
  encrypted[encrypted.length - 1] ^= 0xff;
  assert.throws(() => partnerRepository.decryptResponse(encrypted));
});

test('encryptResponse handles empty object', () => {
  const encrypted = partnerRepository.encryptResponse({});
  assert.ok(Buffer.isBuffer(encrypted));
  const decrypted = partnerRepository.decryptResponse(encrypted);
  assert.deepStrictEqual(decrypted, {});
});
