'use strict';

const database = require('../lib/database/pool');

async function recordAdminLogin({ userId, email, role, ip, userAgent }) {
  await database.query(
    `INSERT INTO public.admin_login_events(profile_id,email,role,ip,user_agent)
     VALUES ($1,$2,$3,$4,$5)`, [userId, email, role, ip, userAgent],
  );
}

async function deleteAccount(userId) {
  return database.transaction(async (client) => {
    const { rows } = await client.query('SELECT public.delete_account_pii($1) AS scrubbed', [userId]);
    if (!rows[0]?.scrubbed) return false;
    const deleted = await client.query('DELETE FROM public.app_users WHERE id = $1', [userId]);
    return deleted.rowCount === 1;
  });
}

async function createUser({ email, passwordHash }) {
  const { rows } = await database.query(
    `INSERT INTO public.app_users(email, password_hash, email_verified_at)
     VALUES ($1, $2, now())
     RETURNING id, email, disabled_at, created_at`,
    [email.trim().toLowerCase(), passwordHash],
  );
  return rows[0];
}

async function getUserByEmail(email) {
  const { rows } = await database.query(
    `SELECT id, email, password_hash, disabled_at, last_login_at
     FROM public.app_users WHERE lower(email) = lower($1) LIMIT 1`,
    [email.trim()],
  );
  return rows[0] || null;
}

async function getUserById(id) {
  const { rows } = await database.query(
    'SELECT id, email, disabled_at FROM public.app_users WHERE id = $1', [id],
  );
  return rows[0] || null;
}

async function recordLogin(id) {
  const { rows } = await database.query(
    `UPDATE public.app_users SET last_login_at = now(), updated_at = now()
     WHERE id = $1 AND disabled_at IS NULL RETURNING id, email`, [id],
  );
  return rows[0] || null;
}

async function updatePassword(id, passwordHash) {
  const { rowCount } = await database.query(
    'UPDATE public.app_users SET password_hash = $2, updated_at = now() WHERE id = $1',
    [id, passwordHash],
  );
  return rowCount === 1;
}

async function setDisabled(id, disabled) {
  const { rowCount } = await database.query(
    `UPDATE public.app_users SET disabled_at=$2, updated_at=now() WHERE id=$1`,
    [id, disabled ? new Date() : null],
  );
  if (disabled) await revokeAll(id, Date.now());
  return rowCount === 1;
}

async function insertSession(row) {
  const { rows } = await database.query(
    `INSERT INTO public.app_sessions
      (token_hash,user_id,created_at,last_seen_at,idle_expires_at,absolute_expires_at,user_agent,ip)
     VALUES ($1,$2,to_timestamp($3 / 1000.0),to_timestamp($3 / 1000.0),
       to_timestamp($4 / 1000.0),to_timestamp($5 / 1000.0),$6,$7)
     RETURNING id`,
    [row.token_hash, row.user_id, row.now, row.idle_expires_at, row.absolute_expires_at,
      row.user_agent, row.ip],
  );
  return rows[0];
}

async function getSession(tokenHash, now) {
  const { rows } = await database.query(
    `SELECT id, token_hash, user_id,
       (extract(epoch from created_at) * 1000)::bigint AS created_at,
       (extract(epoch from last_seen_at) * 1000)::bigint AS last_seen_at,
       (extract(epoch from idle_expires_at) * 1000)::bigint AS idle_expires_at,
       (extract(epoch from absolute_expires_at) * 1000)::bigint AS absolute_expires_at,
       revoked_at
     FROM public.app_sessions
     WHERE token_hash = $1 AND revoked_at IS NULL
       AND idle_expires_at > to_timestamp($2 / 1000.0)
       AND absolute_expires_at > to_timestamp($2 / 1000.0)`,
    [tokenHash, now],
  );
  if (!rows[0]) return null;
  for (const key of ['created_at', 'last_seen_at', 'idle_expires_at', 'absolute_expires_at']) {
    rows[0][key] = Number(rows[0][key]);
  }
  return rows[0];
}

async function touchSession(id, now, idle) {
  await database.query(
    `UPDATE public.app_sessions SET
       last_seen_at = GREATEST(last_seen_at, to_timestamp($2 / 1000.0)),
       idle_expires_at = LEAST(absolute_expires_at, GREATEST(idle_expires_at, to_timestamp($3 / 1000.0)))
     WHERE id = $1 AND revoked_at IS NULL
       AND idle_expires_at > to_timestamp($2 / 1000.0)
       AND absolute_expires_at > to_timestamp($2 / 1000.0)`, [id, now, idle],
  );
}

async function revokeSession(tokenHash, now) {
  await database.query(
    `UPDATE public.app_sessions SET revoked_at = to_timestamp($2 / 1000.0)
     WHERE token_hash = $1 AND revoked_at IS NULL`, [tokenHash, now],
  );
}

async function revokeAll(userId, now) {
  await database.query(
    `UPDATE public.app_sessions SET revoked_at = to_timestamp($2 / 1000.0)
     WHERE user_id = $1 AND revoked_at IS NULL`, [userId, now],
  );
}

async function saveResetFlow({ state_hash, user_id, expires_at }) {
  await database.query(
    `INSERT INTO public.password_reset_flows(state_hash,user_id,expires_at)
     VALUES ($1,$2,to_timestamp($3 / 1000.0))`, [state_hash, user_id, expires_at],
  );
}

async function claimResetFlow(stateHash, now) {
  const { rows } = await database.query(
    `UPDATE public.password_reset_flows SET consumed_at = to_timestamp($2 / 1000.0)
     WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > to_timestamp($2 / 1000.0)
     RETURNING user_id`, [stateHash, now],
  );
  return rows[0] || null;
}

async function saveResetTicket({ ticket_hash, user_id, expires_at }) {
  await database.query(
    `INSERT INTO public.password_reset_tokens(token_hash,user_id,expires_at)
     VALUES ($1,$2,to_timestamp($3 / 1000.0))`, [ticket_hash, user_id, expires_at],
  );
}

async function claimResetTicket(ticketHash, now) {
  const { rows } = await database.query(
    `UPDATE public.password_reset_tokens SET consumed_at = to_timestamp($2 / 1000.0)
     WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > to_timestamp($2 / 1000.0)
     RETURNING user_id`, [ticketHash, now],
  );
  return rows[0] || null;
}

async function prune(now) {
  await database.query(
    `DELETE FROM public.app_sessions WHERE idle_expires_at <= to_timestamp($1 / 1000.0)
       OR absolute_expires_at <= to_timestamp($1 / 1000.0)`, [now],
  );
  await database.query(
    `DELETE FROM public.password_reset_flows WHERE expires_at <= to_timestamp($1 / 1000.0)`, [now],
  );
  await database.query(
    `DELETE FROM public.password_reset_tokens WHERE expires_at <= to_timestamp($1 / 1000.0)`, [now],
  );
}

async function deleteUser(userId) {
  await database.query('DELETE FROM public.app_users WHERE id = $1', [userId]);
}

module.exports = {
  createUser, getUserByEmail, getUserById, recordLogin, updatePassword, setDisabled,
  insertSession, getSession, touchSession, revokeSession, revokeAll,
  saveResetFlow, claimResetFlow, saveResetTicket, claimResetTicket, prune, deleteUser,
  recordAdminLogin, deleteAccount,
};
