require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const repository = require('../repositories/authRepository');
const mailer = require('../lib/mailer');
const sessions = require('../lib/appSessions');
const controller = require('../controllers/authController');
const { config } = require('../lib/config');

const user = { id: 'user-a', email: 'test@example.com' };
function req(token, body = {}) {
  return { body, ip: '127.0.0.1', get: (name) => name === 'authorization' ? `Bearer ${token}` : 'test-agent' };
}
function response() {
  return { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test('PostgreSQL sessions hash tokens, restore active users and revoke on logout', async (t) => {
  const records = new Map();
  t.mock.method(repository, 'prune', async () => {});
  t.mock.method(repository, 'insertSession', async (row) => records.set(row.token_hash, { ...row, id: 'session-a', last_seen_at: row.now, revoked_at: null }));
  t.mock.method(repository, 'getSession', async (hash) => {
    const record = records.get(hash);
    return record && !record.revoked_at ? record : null;
  });
  t.mock.method(repository, 'getUserById', async () => user);
  t.mock.method(repository, 'touchSession', async () => {});
  t.mock.method(repository, 'revokeSession', async (hash) => { const row = records.get(hash); if (row) row.revoked_at = Date.now(); });
  const session = await sessions.createSession(user, req());
  assert.equal(records.has(session.token), false);
  assert.ok(records.has(sessions.hashToken(session.token)));
  assert.equal((await sessions.findSession(req(session.token))).user.id, user.id);
  await sessions.revokeSession(req(session.token));
  assert.equal(await sessions.findSession(req(session.token)), null);
});

test('password reset uses expiring single-use token and ticket, then revokes sessions', async (t) => {
  const flowHash = crypto.createHash('sha256');
  let savedFlow;
  let savedTicket;
  let consumedFlow = false;
  let consumedTicket = false;
  let updatedHash;
  t.mock.method(repository, 'prune', async () => {});
  t.mock.method(repository, 'getUserByEmail', async () => user);
  t.mock.method(repository, 'saveResetFlow', async (flow) => { savedFlow = flow; });
  t.mock.method(repository, 'claimResetFlow', async (hash) => {
    if (consumedFlow || hash !== savedFlow.state_hash) return null;
    consumedFlow = true; return { user_id: user.id };
  });
  t.mock.method(repository, 'saveResetTicket', async (ticket) => { savedTicket = ticket; });
  t.mock.method(repository, 'claimResetTicket', async (hash) => {
    if (consumedTicket || hash !== savedTicket.ticket_hash) return null;
    consumedTicket = true; return { user_id: user.id };
  });
  t.mock.method(repository, 'updatePassword', async (_id, hash) => { updatedHash = hash; return true; });
  t.mock.method(repository, 'revokeAll', async () => {});
  let emailUrl;
  t.mock.method(mailer, 'sendPasswordReset', async (_email, url) => { emailUrl = url; });
  const oldUrl = config.publicUrls.web;
  config.publicUrls.web = 'https://example.com';
  t.after(() => { config.publicUrls.web = oldUrl; });

  const accepted = response();
  await controller.requestPasswordReset(req(null, { email: user.email }), accepted);
  assert.equal(accepted.statusCode, 202);
  assert.deepEqual(accepted.body, { accepted: true });
  const token = new URL(emailUrl).searchParams.get('token');
  assert.ok(token);
  assert.equal(savedFlow.state_hash, flowHash.update(token).digest('hex'));
  const exchange = response();
  await controller.exchangePasswordReset(req(null, { token }), exchange);
  assert.equal(exchange.statusCode, 200);
  const replay = response();
  await controller.exchangePasswordReset(req(null, { token }), replay);
  assert.equal(replay.statusCode, 400);
  const complete = response();
  await controller.completePasswordReset(req(null, { ticket: exchange.body.ticket, password: 'new-secure-password' }), complete);
  assert.equal(complete.statusCode, 204);
  assert.match(updatedHash, /^scrypt\$/);
  const completeReplay = response();
  await controller.completePasswordReset(req(null, { ticket: exchange.body.ticket, password: 'new-secure-password' }), completeReplay);
  assert.equal(completeReplay.statusCode, 400);
});

test('password reset request keeps the same public response for unknown addresses', async (t) => {
  t.mock.method(repository, 'prune', async () => {});
  t.mock.method(repository, 'getUserByEmail', async () => null);
  const accepted = response();
  await controller.requestPasswordReset(req(null, { email: 'nobody@example.com' }), accepted);
  assert.equal(accepted.statusCode, 202);
  assert.deepEqual(accepted.body, { accepted: true });
});
