// ---------------------------------------------------------------------
// Admin: read and triage the error_logs table (migration 0042).
//
// The rows are written by lib/errorLog.js, which intercepts every
// console.error in the app. This is the only way anyone reads them —
// error_logs is revoked from anon and authenticated, so there is no
// client path to it that does not come through here, behind requireAdmin
// (applied router-wide in routes/admin.js).
//
// Pagination follows listBookings in adminController.js — the same
// { total, limit, offset, ... } contract, so the frontend pager has one
// shape to learn.
// ---------------------------------------------------------------------
const database = require('../lib/database/pool');
const { logAudit } = require('../lib/audit');

// Stack traces are large and useless in a list; getError fetches the one
// row the admin actually opened.
const LIST_COLS =
  'id, occurred_at, severity, label, message, error_name, method, path, status_code, ' +
  'request_id, user_id, user_email, user_role, fingerprint, suppressed_count, ' +
  'resolved_at, resolved_by';

const SINCE_HOURS = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };

// --- GET /api/admin/errors -------------------------------------------
async function listErrors(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const values = [];
    const filters = [];
    const bind = (value) => { values.push(value); return `$${values.length}`; };
    const status = req.query.status || 'open';
    if (status === 'open') filters.push('resolved_at IS NULL');
    else if (status === 'resolved') filters.push('resolved_at IS NOT NULL');

    const hours = SINCE_HOURS[req.query.since];
    if (hours) {
      filters.push(`occurred_at >= ${bind(new Date(Date.now() - hours * 3600_000).toISOString())}`);
    }
    for (const key of ['severity','label','fingerprint','user_id']) {
      if (req.query[key]) filters.push(`${key}=${bind(req.query[key])}`);
    }

    const term = (req.query.q || '').trim();
    if (term) {
      const search = bind(term.toLowerCase());
      filters.push(`position(${search} in lower(concat_ws(' ',label,message,path,user_email))) > 0`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows: counts } = await database.query(`SELECT count(*)::int AS total FROM public.error_logs ${where}`, values);
    values.push(limit, offset);
    const { rows: errors } = await database.query(
      `SELECT ${LIST_COLS} FROM public.error_logs ${where} ORDER BY occurred_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values,
    );
    return res.json({ total: counts[0].total, limit, offset, errors });
  } catch (err) {
    console.error('listErrors error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/admin/errors/summary -----------------------------------
async function errorSummary(req, res) {
  try {
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

    const [openResult, recentResult] = await Promise.all([
      database.query('SELECT count(*)::int AS count FROM public.error_logs WHERE resolved_at IS NULL'),
      database.query(`SELECT label,fingerprint,message,suppressed_count,occurred_at FROM public.error_logs
        WHERE resolved_at IS NULL AND occurred_at >= $1 ORDER BY occurred_at DESC LIMIT 500`, [dayAgo]),
    ]);
    const recentRows = recentResult.rows;
    const last24hResult = await database.query('SELECT count(*)::int AS count FROM public.error_logs WHERE occurred_at >= $1', [dayAgo]);

    const groups = new Map();
    for (const row of recentRows) {
      const g = groups.get(row.fingerprint) || {
        fingerprint: row.fingerprint,
        label: row.label,
        message: row.message,
        occurrences: 0,
        last_seen: row.occurred_at,
      };
      g.occurrences += (row.suppressed_count || 0) + 1;
      if (row.occurred_at > g.last_seen) g.last_seen = row.occurred_at;
      groups.set(row.fingerprint, g);
    }

    const top = [...groups.values()].sort((a, b) => b.occurrences - a.occurrences).slice(0, 10);

    return res.json({ open: openResult.rows[0].count, last24h: last24hResult.rows[0].count, top });
  } catch (err) {
    console.error('errorSummary error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/admin/errors/:id ---------------------------------------
async function getError(req, res) {
  try {
    const { rows } = await database.query('SELECT * FROM public.error_logs WHERE id=$1', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Error log not found' });

    // The other times this bug fired: the fastest way to see whether it
    // hits one user or everyone.
    const { rows: related } = await database.query(
      `SELECT id,occurred_at,user_email,path,suppressed_count FROM public.error_logs
       WHERE fingerprint=$1 AND id<>$2 ORDER BY occurred_at DESC LIMIT 20`, [row.fingerprint,row.id],
    );

    return res.json({ error_log: row, related });
  } catch (err) {
    console.error('getError error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/admin/errors/:id/resolve -------------------------------
// Resolving the whole fingerprint rather than the single row: the admin is
// saying "this bug is dealt with", and clearing one of two hundred
// identical rows would leave the list exactly as noisy as before.
async function resolveError(req, res) {
  try {
    const resolved = req.body && req.body.resolved === false ? false : true;

    const { rows } = await database.query('SELECT id,fingerprint,label FROM public.error_logs WHERE id=$1', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Error log not found' });

    const { rowCount: count } = await database.query(
      `UPDATE public.error_logs SET resolved_at=$2,resolved_by=$3 WHERE fingerprint=$1`,
      [row.fingerprint, resolved ? new Date() : null, resolved ? req.adminId : null],
    );

    logAudit({
      actorId: req.adminId,
      action: resolved ? 'admin_error_resolved' : 'admin_error_reopened',
      resourceType: 'error_log',
      resourceId: row.id,
      meta: { label: row.label, fingerprint: row.fingerprint, rows: count },
    });

    return res.json({ ok: true, resolved, updated: count });
  } catch (err) {
    console.error('resolveError error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { listErrors, errorSummary, getError, resolveError };
