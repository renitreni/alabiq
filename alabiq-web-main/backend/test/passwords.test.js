require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, isLegacyHash } = require('../lib/passwords');

test('password hashes use independent salts and verify the right password', async () => {
  const [first, second] = await Promise.all([hashPassword('correct horse battery'), hashPassword('correct horse battery')]);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('correct horse battery', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
});

test('password verification rejects malformed and excessive work factors', async () => {
  assert.equal(await verifyPassword('password', 'legacy-hash'), false);
  assert.equal(await verifyPassword('password', 'scrypt$262144$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), false);
});

test('legacy bcrypt hashes (Supabase GoTrue) verify transparently', async (t) => {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('supabase password', 10);
  assert.equal(isLegacyHash(hash), true);
  assert.equal(await verifyPassword('supabase password', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
  assert.equal(isLegacyHash('$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'), true);
  assert.equal(isLegacyHash('$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'), true);
  assert.equal(isLegacyHash('not-a-hash'), false);
  assert.equal(isLegacyHash(null), false);
  const scryptHash = await hashPassword('password');
  assert.equal(isLegacyHash(scryptHash), false);
  // A bcrypt-shaped string with bad payload must not throw.
  assert.equal(await verifyPassword('password', '$2b$10$short'), false);
});
