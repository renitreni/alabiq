const crypto = require('crypto');
const authRepository = require('../repositories/authRepository');

const IDLE_DAYS = 30;
const ABSOLUTE_DAYS = 90;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function bearer(req) {
  const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function createSession(user, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await authRepository.prune(now);
  await authRepository.insertSession({
    token_hash: hashToken(token),
    user_id: user.id,
    now,
    idle_expires_at: now + IDLE_DAYS * 86400000,
    absolute_expires_at: now + ABSOLUTE_DAYS * 86400000,
    user_agent: String(req.get('user-agent') || '').slice(0, 500) || null,
    ip: req.ip || null,
  });
  return { token, user: { id: user.id, email: user.email } };
}

async function findSession(req) {
  const token = bearer(req);
  if (!token) return null;
  const now = Date.now();
  const data = await authRepository.getSession(hashToken(token), now);
  if (!data) return null;

  if (now - data.last_seen_at >= TOUCH_EVERY_MS) {
    await authRepository.touchSession(data.id, now, now + IDLE_DAYS * 86400000);
  }
  const user = await authRepository.getUserById(data.user_id);
  if (!user || user.disabled_at) return null;
  return { id: data.id, user: { id: user.id, email: user.email } };
}

async function revokeSession(req) {
  const token = bearer(req);
  if (!token) return;
  await authRepository.revokeSession(hashToken(token), Date.now());
}

async function revokeAll(userId) {
  await authRepository.revokeAll(userId, Date.now());
}

module.exports = {
  bearer,
  createSession,
  findSession,
  revokeSession,
  revokeAll,
  hashToken,
};
