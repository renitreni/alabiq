// ---------------------------------------------------------------------
// Audit logging (SDAIA / PCI-DSS access control, PRD §8.4).
//
// Writes an immutable who-did-what-when row to audit_logs (migration
// 0012) for every privileged action and access to sensitive data:
// admin suspend/reconcile, payment verification, credit charges, etc.
// Best-effort like logNotification — an audit failure is logged but
// never breaks the request that triggered it. Never put secrets, tokens,
// or raw payment data in `meta`.
// ---------------------------------------------------------------------
const database = require('./database/pool');

async function logAudit({ actorId = null, action, resourceType = null, resourceId = null, meta = null }) {
  try {
    await database.query(
      `INSERT INTO public.audit_logs(actor_id,action,resource_type,resource_id,meta)
       VALUES ($1,$2,$3,$4,$5)`,
      [actorId, action, resourceType, resourceId != null ? String(resourceId) : null, meta],
    );
  } catch (err) {
    console.error('logAudit error:', err.message || err);
  }
}

module.exports = { logAudit };
