// ---------------------------------------------------------------------
// Admin account management (migration 0043, tier removed 2026-10).
// Any admin may manage admin accounts, platform settings and login
// activity; routes/admin.js only runs the router-wide requireAdmin.
// Self-deactivation, demoting the last super admin, and ADMIN_EMAILS
// accounts are still refused below.
//
//   listAdmins        : GET    /api/admin/admins
//   createAdmin       : POST   /api/admin/admins
//   updateAdmin       : PATCH  /api/admin/admins/:id
//   resetAdminPassword: POST   /api/admin/admins/:id/password
//   deactivateAdmin   : POST   /api/admin/admins/:id/deactivate
//   reactivateAdmin   : POST   /api/admin/admins/:id/reactivate
//   getSettings       : GET    /api/admin/settings
//   updateSettings    : PATCH  /api/admin/settings
//   listLoginEvents   : GET    /api/admin/login-events
//   loginEventSummary : GET    /api/admin/login-events/summary
//
// Account creation uses the app-owned PostgreSQL credential store. Passwords
// are provided by the admin creating/resetting the account.
// The plaintext password is never stored by us and cannot be read back afterwards.
//
// Deactivation updates app_users and profiles and revokes existing sessions.
// ---------------------------------------------------------------------
const database = require('../lib/database/pool');
const authRepository = require('../repositories/authRepository');
const profileRepository = require('../repositories/profileRepository');
const { hashPassword } = require('../lib/passwords');
const { config } = require('../lib/config');
const { logAudit } = require('../lib/audit');
const { passwordError } = require('../lib/validate');
const {
  getMaxDistanceKm,
  setMaxDistanceKm,
  getStcPayEnabled,
  setStcPayEnabled,
} = require('../lib/settings');

const ADMIN_SELECT =
  'id, email, full_name, mobile_number, whatsapp_number, role, is_super_admin, ' +
  'disabled_at, disabled_by, created_at';

// Select fields for all users (includes driver_approved for drivers)
const USER_SELECT =
  'id, email, full_name, mobile_number, whatsapp_number, role, is_super_admin, ' +
  'driver_approved, driver_verification_status, disabled_at, disabled_by, created_at, ' +
  '(SELECT MAX(occurred_at) FROM public.admin_login_events ale WHERE ale.profile_id = p.id) AS last_login_at';

// An admin listed in ADMIN_EMAILS cannot be demoted or deactivated here.
//
// syncProfile 403s any ADMIN_EMAILS address arriving on a profile that is
// not already role='admin' (the escalation guard). Demoting one therefore
// does not downgrade the account — it bricks it: they can still sign in to
// Supabase but every /api/auth/sync afterwards is refused, so the app is
// unusable and there is no in-portal way back. The env has to change first.
function isEnvAdmin(email) {
  return config.adminEmails.includes(String(email || '').toLowerCase());
}

async function loadAdmin(id) {
  const profile = await profileRepository.getProfileById(id);
  if (!profile || profile.role !== 'admin') return null;
  return Object.fromEntries(ADMIN_SELECT.split(', ').map((key) => [key, profile[key]]));
}

// --- Read -------------------------------------------------------------
async function listAdmins(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = (req.query.sortOrder || 'asc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    const values = [];
    const whereClauses = [`p.role = 'admin'`];

    if (search) {
      values.push(`%${search}%`);
      whereClauses.push(`(p.email ILIKE $${values.length} OR p.full_name ILIKE $${values.length})`);
    }

    // Additional filters from filters object
    Object.entries(filtersObj).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      values.push(value);
      whereClauses.push(`p.${key} = $${values.length}`);
    });

    const where = `WHERE ${whereClauses.join(' AND ')}`;

    const allowedSortColumns = ['id', 'email', 'full_name', 'mobile_number', 'whatsapp_number', 'role', 'is_super_admin', 'disabled_at', 'disabled_by', 'created_at'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const countQuery = `SELECT count(*)::int AS total FROM public.profiles p ${where}`;
    const { rows: countRows } = await database.query(countQuery, values);
    const total = countRows[0]?.total || 0;

    values.push(limit, offset);
    const dataQuery = `
      SELECT ${ADMIN_SELECT}
      FROM public.profiles p
      ${where}
      ORDER BY p.${safeSortBy} ${safeSortOrder}
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;
    const { rows: data } = await database.query(dataQuery, values);

    const admins = (data || []).map((a) => ({ ...a, env_managed: isEnvAdmin(a.email) }));

    return res.json({
      data: admins,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      sort: {
        sortBy: safeSortBy,
        sortOrder: safeSortOrder.toLowerCase(),
      },
      filters: filtersObj,
    });
  } catch (err) {
    console.error('listAdmins error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- All Users (Accounts tab) -----------------------------------------
async function listAllUsers(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    
    // New: sorting parameters
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    // New: filters object (for column-specific filters)
    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }
    
    // Backward compatibility: also read role/status from query string
    const role = filtersObj.role || req.query.role;
    const status = filtersObj.status || req.query.status;

    const values = [];
    const whereClauses = [];

    if (search) {
      values.push(`%${search}%`);
      whereClauses.push(`(p.email ILIKE $${values.length} OR p.full_name ILIKE $${values.length})`);
    }
    if (role) {
      values.push(role);
      whereClauses.push(`p.role = $${values.length}`);
    }
    if (status === 'active') {
      whereClauses.push(`p.disabled_at IS NULL`);
    } else if (status === 'disabled') {
      whereClauses.push(`p.disabled_at IS NOT NULL`);
    }

    // Additional filters from filters object
    Object.entries(filtersObj).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      if (['role', 'status'].includes(key)) return; // Already handled
      
      values.push(value);
      whereClauses.push(`p.${key} = $${values.length}`);
    });

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Validate sortBy to prevent SQL injection
    const allowedSortColumns = ['id', 'email', 'full_name', 'role', 'created_at', 'last_login_at', 'disabled_at'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const countQuery = `SELECT count(*)::int AS total FROM public.profiles p ${where}`;
    const { rows: countRows } = await database.query(countQuery, values);
    const total = countRows[0]?.total || 0;

    values.push(limit, offset);
    const dataQuery = `
      SELECT ${USER_SELECT}
      FROM public.profiles p
      ${where}
      ORDER BY p.${safeSortBy} ${safeSortOrder}
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;
    const { rows: data } = await database.query(dataQuery, values);

    const users = (data || []).map((u) => ({
      ...u,
      env_managed: isEnvAdmin(u.email),
      status: u.disabled_at ? 'disabled' : 'active',
    }));

    // Standardized response format
    return res.json({
      data: users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      sort: {
        sortBy: safeSortBy,
        sortOrder: safeSortOrder.toLowerCase(),
      },
      filters: filtersObj,
    });
  } catch (err) {
    console.error('listAllUsers error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Create -----------------------------------------------------------
async function createAdmin(req, res) {
  try {
    const b = req.body; // validated by the route schema
    const email = String(b.email).trim().toLowerCase();
    const password = String(b.password);

    const pwdErr = passwordError(password);
    if (pwdErr) return res.status(400).json({ error: pwdErr });

    let userId;
    let reusedExistingAccount = false;

    let existing = await authRepository.getUserByEmail(email);
    if (existing) {
      // The address may already belong to a passenger or driver. Promoting
      // an existing account is legitimate and is how a staff member who
      // already uses the app becomes an admin, so reuse it rather than
      // refusing. Their password is reset either way, because whoever is
      // being handed the portal needs credentials they can be told.
      userId = existing.id;
      reusedExistingAccount = true;
      await authRepository.updatePassword(userId, await hashPassword(password));
      await authRepository.setDisabled(userId, false);
    } else {
      existing = await authRepository.createUser({ email, passwordHash: await hashPassword(password) });
      userId = existing.id;
    }

    // driver_approved: true matches what the seed scripts write — admins
    // bypass the approval gate anyway (requireApprovedDriver), and leaving
    // it false makes the row read as a pending driver in admin lists.
    await profileRepository.upsertProfile(
      {
        id: userId,
        role: 'admin',
        email,
        full_name: b.full_name,
        mobile_number: b.mobile_number ?? null,
        whatsapp_number: b.whatsapp_number ?? null,
        driver_approved: true,
        is_super_admin: !!b.is_super_admin,
        disabled_at: null,
        disabled_by: null,
      }
    );

    await logAudit({
      actorId: req.adminId,
      action: 'admin.create',
      resourceType: 'profile',
      resourceId: userId,
      meta: { email, is_super_admin: !!b.is_super_admin, reused_existing_account: reusedExistingAccount },
    });

    return res.status(201).json({
      admin: await loadAdmin(userId),
      reused_existing_account: reusedExistingAccount,
    });
  } catch (err) {
    console.error('createAdmin error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Update -----------------------------------------------------------
async function updateAdmin(req, res) {
  try {
    const b = req.body;
    const target = await loadAdmin(req.params.id);
    if (!target) return res.status(404).json({ error: 'Admin not found' });

    const patch = {};
    if (b.full_name !== undefined) patch.full_name = b.full_name;
    if (b.mobile_number !== undefined) patch.mobile_number = b.mobile_number;
    if (b.whatsapp_number !== undefined) patch.whatsapp_number = b.whatsapp_number;

    if (b.is_super_admin !== undefined && b.is_super_admin !== target.is_super_admin) {
      // Dropping your own super-admin flag is a one-way door: the moment it
      // is written you can no longer reach this endpoint to undo it.
      if (target.id === req.adminId && !b.is_super_admin) {
        return res.status(409).json({
          error: 'You cannot remove your own super admin access. Ask another admin to do it.',
        });
      }
      if (!b.is_super_admin && (await countOtherSuperAdmins(target.id)) === 0) {
        return res.status(409).json({
          error: 'This is the last super admin. Promote someone else first.',
        });
      }
      patch.is_super_admin = !!b.is_super_admin;
    }

    if (!Object.keys(patch).length) return res.json({ admin: target });

    await profileRepository.updateProfile(target.id, patch);

    await logAudit({
      actorId: req.adminId,
      action: 'admin.update',
      resourceType: 'profile',
      resourceId: target.id,
      meta: { email: target.email, changed: Object.keys(patch) },
    });
    return res.json({ admin: await loadAdmin(target.id) });
  } catch (err) {
    console.error('updateAdmin error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// How many OTHER active super admins exist. Used by both the demote and
// the deactivate guards: the platform must never end up with none, because
// nothing outside this endpoint can grant the flag back except SQL.
async function countOtherSuperAdmins(excludeId) {
  const { rows } = await database.query(
    `SELECT count(*)::int AS count FROM public.profiles
     WHERE is_super_admin=true AND disabled_at IS NULL AND id<>$1`, [excludeId],
  );
  return rows[0].count;
}

// --- Password reset ---------------------------------------------------
async function resetAdminPassword(req, res) {
  try {
    const target = await loadAdmin(req.params.id);
    if (!target) return res.status(404).json({ error: 'Admin not found' });

    const password = String(req.body.password);
    const pwdErr = passwordError(password);
    if (pwdErr) return res.status(400).json({ error: pwdErr });

    const updated = await authRepository.updatePassword(target.id, await hashPassword(password));
    if (!updated) {
      return res.status(500).json({ error: 'Could not reset the password' });
    }
    await authRepository.setDisabled(target.id, false);

    // The new password is deliberately NOT in meta: audit_logs is readable
    // by every admin, and a credential does not belong in a log row.
    await logAudit({
      actorId: req.adminId,
      action: 'admin.password_reset',
      resourceType: 'profile',
      resourceId: target.id,
      meta: { email: target.email },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('resetAdminPassword error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Deactivate / reactivate ------------------------------------------
async function deactivateAdmin(req, res) {
  try {
    const target = await loadAdmin(req.params.id);
    if (!target) return res.status(404).json({ error: 'Admin not found' });

    if (target.id === req.adminId) {
      return res.status(409).json({ error: 'You cannot deactivate your own account.' });
    }
    if (isEnvAdmin(target.email)) {
      return res.status(409).json({
        error:
          'This account is listed in ADMIN_EMAILS. Remove it from the server environment first, ' +
          'otherwise the account is locked out rather than deactivated cleanly.',
      });
    }
    if (target.is_super_admin && (await countOtherSuperAdmins(target.id)) === 0) {
      return res.status(409).json({ error: 'This is the last super admin. Promote someone else first.' });
    }

    // Ban first: it is the half that stops a NEW sign-in. If the profile
    // write below fails, the account is already locked out rather than
    // still open — the safe direction to fail in.
    const disabled = await authRepository.setDisabled(target.id, true);
    if (!disabled) {
      return res.status(500).json({ error: 'Could not deactivate the account' });
    }
    await profileRepository.updateProfile(target.id, { disabled_at: new Date().toISOString(), disabled_by: req.adminId });

    await logAudit({
      actorId: req.adminId,
      action: 'admin.deactivate',
      resourceType: 'profile',
      resourceId: target.id,
      meta: { email: target.email },
    });
    return res.json({ admin: await loadAdmin(target.id) });
  } catch (err) {
    console.error('deactivateAdmin error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function reactivateAdmin(req, res) {
  try {
    const target = await loadAdmin(req.params.id);
    if (!target) return res.status(404).json({ error: 'Admin not found' });

    await authRepository.setDisabled(target.id, false);
    await profileRepository.updateProfile(target.id, { disabled_at: null, disabled_by: null });

    await logAudit({
      actorId: req.adminId,
      action: 'admin.reactivate',
      resourceType: 'profile',
      resourceId: target.id,
      meta: { email: target.email },
    });
    return res.json({ admin: await loadAdmin(target.id) });
  } catch (err) {
    console.error('reactivateAdmin error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Settings ---------------------------------------------------------
async function currentSettings() {
  return {
    max_distance_km: await getMaxDistanceKm(),
    stcpay_enabled: await getStcPayEnabled(),
  };
}

async function getSettings(req, res) {
  try {
    return res.json(await currentSettings());
  } catch (err) {
    console.error('getSettings error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// PATCH semantics: a field that is not sent is not changed. That matters
// more than it looks now that there is more than one setting - a client
// that PATCHes only stcpay_enabled must not silently clear the distance
// limit, and `undefined` is the only value that can mean "not sent",
// because null is a real stored value for max_distance_km.
async function updateSettings(req, res) {
  try {
    const b = req.body;
    const touchesDistance = b.max_distance_km !== undefined;
    const touchesStcPay = b.stcpay_enabled !== undefined;

    if (!touchesDistance && !touchesStcPay) {
      return res.status(400).json({
        error: 'Send max_distance_km (a number, or null for no limit) or stcpay_enabled (a boolean)',
      });
    }

    const changed = {};

    if (touchesDistance) {
      const value = b.max_distance_km === null ? null : Number(b.max_distance_km);
      if (value !== null && (!Number.isFinite(value) || value <= 0)) {
        return res.status(400).json({ error: 'max_distance_km must be a positive number, or null for no limit' });
      }
      await setMaxDistanceKm(value, req.adminId);
      changed.max_distance_km = value;
    }

    if (touchesStcPay) {
      if (typeof b.stcpay_enabled !== 'boolean') {
        return res.status(400).json({ error: 'stcpay_enabled must be true or false' });
      }
      await setStcPayEnabled(b.stcpay_enabled, req.adminId);
      changed.stcpay_enabled = b.stcpay_enabled;
    }

    // One audit row per setting touched, not one per request: resourceId is
    // the setting key, and a row naming two keys at once cannot answer
    // "who turned STC Pay off" without parsing meta.
    for (const [key, value] of Object.entries(changed)) {
      await logAudit({
        actorId: req.adminId,
        action: 'settings.update',
        resourceType: 'app_settings',
        resourceId: key,
        meta: { [key]: value },
      });
    }

    return res.json(await currentSettings());
  } catch (err) {
    console.error('updateSettings error:', err);
    return res.status(500).json({ error: 'Could not save the setting' });
  }
}


// --- Login activity ---------------------------------------------------
async function listLoginEvents(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    
    const sortBy = req.query.sortBy || 'occurred_at';
    const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    const values = [];
    const whereClauses = [];

    if (search) {
      values.push(`%${search}%`);
      whereClauses.push(`(email ILIKE $${values.length} OR ip ILIKE $${values.length} OR user_agent ILIKE $${values.length})`);
    }
    
    // Backward compatibility: profile_id, since
    if (filtersObj.profile_id || req.query.profile_id) {
      values.push(filtersObj.profile_id || req.query.profile_id);
      whereClauses.push(`profile_id = $${values.length}`);
    }
    if (filtersObj.since || req.query.since) {
      values.push(filtersObj.since || req.query.since);
      whereClauses.push(`occurred_at >= $${values.length}`);
    }

    // Additional filters from filters object
    Object.entries(filtersObj).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      if (['profile_id', 'since'].includes(key)) return; // Already handled
      
      values.push(value);
      whereClauses.push(`${key} = $${values.length}`);
    });

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const allowedSortColumns = ['id', 'occurred_at', 'profile_id', 'email', 'role', 'ip', 'user_agent'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'occurred_at';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const countQuery = `SELECT count(*)::int AS total FROM public.admin_login_events ${where}`;
    const { rows: counts } = await database.query(countQuery, values);
    const total = counts[0]?.total || 0;

    values.push(limit, offset);
    const { rows: events } = await database.query(
      `SELECT id,occurred_at,profile_id,email,role,ip,user_agent FROM public.admin_login_events ${where}
         ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT $${values.length - 1} OFFSET $${values.length}`, values,
    );

    return res.json({
      data: events,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      sort: {
        sortBy: safeSortBy,
        sortOrder: safeSortOrder.toLowerCase(),
      },
      filters: filtersObj,
    });
  } catch (err) {
    console.error('listLoginEvents error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
// "How many admins are logging in, and when" — the counts behind the stat
// cards. Aggregated here rather than in SQL because the volume is tiny
// (admins only, pruned at 180 days) and a view would be one more thing to
// migrate.
async function loginEventSummary(req, res) {
  try {
    const windowDays = Math.min(Number(req.query.days) || 30, 180);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const { rows } = await database.query(
      `SELECT profile_id,email,occurred_at FROM public.admin_login_events
       WHERE occurred_at >= $1 ORDER BY occurred_at DESC`, [since],
    );
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const byAdmin = new Map();
    for (const row of rows) {
      // Key on the email snapshot: profile_id goes null once an account is
      // deleted, which would otherwise collapse every deleted admin into one.
      const key = row.profile_id || row.email || 'unknown';
      const entry = byAdmin.get(key);
      if (entry) {
        entry.logins += 1;
      } else {
        // rows are newest-first, so the first one seen is the latest.
        byAdmin.set(key, {
          profile_id: row.profile_id,
          email: row.email,
          logins: 1,
          last_login: row.occurred_at,
        });
      }
    }

    const admins = [...byAdmin.values()].sort((a, b) => b.logins - a.logins);
    return res.json({
      window_days: windowDays,
      total_logins: rows.length,
      distinct_admins: admins.length,
      active_last_24h: admins.filter((a) => Date.parse(a.last_login) >= dayAgo).length,
      admins,
    });
  } catch (err) {
    console.error('loginEventSummary error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- Update User Role -------------------------------------------------
async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['passenger', 'driver', 'merchant', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const profile = await profileRepository.getProfileById(id);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent modifying env-managed admins
    if (profile.role === 'admin' && isEnvAdmin(profile.email)) {
      return res.status(403).json({ error: 'Cannot modify environment-managed admin accounts' });
    }

    // Prevent self-demotion from admin
    const currentUserId = req.user?.id;
    if (currentUserId === id && profile.role === 'admin' && role !== 'admin') {
      return res.status(403).json({ error: 'Cannot change your own admin role' });
    }

    // Prevent demoting the last super admin
    if (profile.is_super_admin && role !== 'admin') {
      const { rows } = await database.query(
        `SELECT count(*)::int AS cnt FROM public.profiles WHERE is_super_admin = true AND id != $1`,
        [id],
      );
      if (Number(rows[0]?.cnt || 0) === 0) {
        return res.status(403).json({ error: 'Cannot demote the last super admin' });
      }
    }

    // Update role in profiles
    const updated = await profileRepository.updateProfile(id, { role });

    // If changing to admin, ensure driver_approved = true and is_super_admin = false (unless explicitly set)
    if (role === 'admin') {
      await profileRepository.updateProfile(id, {
        driver_approved: true,
        is_super_admin: false,
      });
    }

    // If changing from admin to something else, remove super admin status
    if (profile.role === 'admin' && role !== 'admin') {
      await profileRepository.updateProfile(id, { is_super_admin: false });
    }

    // If changing to driver, ensure driver_verification_status is set appropriately
    if (role === 'driver' && !profile.driver_verification_status) {
      await profileRepository.updateProfile(id, { driver_verification_status: 'none' });
    }

    await logAudit(req.user?.id, 'UPDATE_USER_ROLE', { target_user_id: id, old_role: profile.role, new_role: role });

    return res.json({ user: updated });
  } catch (err) {
    console.error('updateUserRole error:', err);
    return res.status(500).json({ error: 'Could not update user role' });
  }
}

// --- Deactivate User --------------------------------------------------
async function deactivateUser(req, res) {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.id;

    const profile = await profileRepository.getProfileById(id);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-deactivation
    if (currentUserId === id) {
      return res.status(403).json({ error: 'Cannot deactivate your own account' });
    }

    // Prevent deactivating env-managed admins
    if (profile.role === 'admin' && isEnvAdmin(profile.email)) {
      return res.status(403).json({ error: 'Cannot deactivate environment-managed admin accounts' });
    }

    // Prevent deactivating the last super admin
    if (profile.is_super_admin) {
      const { rows } = await database.query(
        `SELECT count(*)::int AS cnt FROM public.profiles WHERE is_super_admin = true AND disabled_at IS NULL AND id != $1`,
        [id],
      );
      if (Number(rows[0]?.cnt || 0) === 0) {
        return res.status(403).json({ error: 'Cannot deactivate the last super admin' });
      }
    }

    // Deactivate in both app_users and profiles
    await authRepository.setDisabled(id, true);
    await profileRepository.updateProfile(id, { disabled_at: new Date(), disabled_by: currentUserId });

    await logAudit(currentUserId, 'DEACTIVATE_USER', { target_user_id: id, email: profile.email });

    return res.json({ success: true });
  } catch (err) {
    console.error('deactivateUser error:', err);
    return res.status(500).json({ error: 'Could not deactivate user' });
  }
}

// --- Reactivate User --------------------------------------------------
async function reactivateUser(req, res) {
  try {
    const { id } = req.params;

    const profile = await profileRepository.getProfileById(id);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Reactivate in both app_users and profiles
    await authRepository.setDisabled(id, false);
    await profileRepository.updateProfile(id, { disabled_at: null, disabled_by: null });

    await logAudit(req.user?.id, 'REACTIVATE_USER', { target_user_id: id, email: profile.email });

    return res.json({ success: true });
  } catch (err) {
    console.error('reactivateUser error:', err);
    return res.status(500).json({ error: 'Could not reactivate user' });
  }
}

// --- Reset User Password ----------------------------------------------
async function resetUserPassword(req, res) {
  try {
    const { id } = req.params;

    const profile = await profileRepository.getProfileById(id);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent resetting env-managed admin passwords
    if (profile.role === 'admin' && isEnvAdmin(profile.email)) {
      return res.status(403).json({ error: 'Cannot reset password for environment-managed admin accounts' });
    }

    const password = strongPassword();
    const passwordHash = await hashPassword(password);

    await authRepository.updatePassword(id, passwordHash);

    await logAudit(req.user?.id, 'RESET_USER_PASSWORD', { target_user_id: id, email: profile.email });

    return res.json({ password, email: profile.email });
  } catch (err) {
    console.error('resetUserPassword error:', err);
    return res.status(500).json({ error: 'Could not reset password' });
  }
}

module.exports = {
  listAdmins,
  createAdmin,
  updateAdmin,
  resetAdminPassword,
  deactivateAdmin,
  reactivateAdmin,
  getSettings,
  updateSettings,
  listLoginEvents,
  loginEventSummary,
  listAllUsers,
  updateUserRole,
  deactivateUser,
  reactivateUser,
  resetUserPassword,
};
