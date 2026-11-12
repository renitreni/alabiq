// ---------------------------------------------------------------------
// Auth controller
//   - syncProfile : POST /api/auth/sync   (requireToken)
//
// Called by the frontend right after signup/login. It upserts the caller's
// `profiles` row from their verified token + the role/details they chose,
// and applies the automatic-admin rule (email in ADMIN_EMAILS -> admin).
//
// Role can never be self-elevated to admin via the request body; admin is
// granted ONLY by the env allow-list. Existing admins stay admins.
// ---------------------------------------------------------------------
const authRepository = require('../repositories/authRepository');
const profileRepository = require('../repositories/profileRepository');
const merchantRepository = require('../repositories/merchantRepository');
const { hashPassword, verifyPassword, isLegacyHash } = require('../lib/passwords');
const mailer = require('../lib/mailer');
const { config } = require('../lib/config');
const { buildProfileUpsert } = require('../lib/profileSchema');
const {
  buildAvatarPath,
  createAvatarUploadUrl,
  avatarPublicUrl,
  deleteAvatarFolder,
} = require('../lib/storage');
const {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  emailError,
  nameError,
} = require('../lib/validate');
const { currentContext } = require('../lib/requestContext');
const crypto = require('crypto');
const {
  createSession,
  revokeSession,
  revokeAll,
  hashToken,
} = require('../lib/appSessions');

// The camelCase profile JSON every auth endpoint returns to the UI.
function profileJson(profile, merchant = null) {
  return {
    id: profile.id,
    role: profile.role,
    fullName: profile.full_name,
    whatsapp: profile.whatsapp_number,
    mobile: profile.mobile_number,
    email: profile.email,
    driverApproved: profile.driver_approved,
    // 0043. Absent until the migration is applied — the probe in
    // lib/profileSchema.js leaves the columns out of the select, and the
    // UI reads a missing flag as "not a super admin", which is correct.
    isSuperAdmin: !!profile.is_super_admin,
    serviceTypes: profile.service_types,
    avatarUrl: profile.avatar_url ?? null,
    address: profile.address ?? null,
    merchant,
  };
}

// Roles a user may pick for themselves at signup. Admin is env-list only.
// Merchant (restaurant owner) accounts are provisioned by admins after partnership
// approval — not via public self-registration (see adminFoodController.setMerchantOwner).
const SELF_ROLES = ['passenger', 'driver'];

async function login(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const account = await authRepository.getUserByEmail(email);
    if (!account || !(await verifyPassword(password, account.password_hash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    if (account.disabled_at) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }
    // Migrated Supabase accounts still carry bcrypt hashes. Re-hash to
    // scrypt on first successful login so the legacy path can be retired.
    // A rehash failure must not block the login — the bcrypt path keeps
    // working until it succeeds on a later attempt.
    if (isLegacyHash(account.password_hash)) {
      hashPassword(password)
        .then((passwordHash) => authRepository.updatePassword(account.id, passwordHash))
        .catch((err) => console.error('legacy password rehash failed:', err.message));
    }
    const user = await authRepository.recordLogin(account.id);
    if (!user) return res.status(403).json({ error: 'This account has been deactivated.' });
    const session = await createSession(user, req);
    return res.json(session);
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Could not sign in. Please try again.' });
  }
}

async function sessionInfo(req, res) {
  return res.json({ user: req.authUser });
}

async function logout(req, res) {
  try {
    await revokeSession(req);
    return res.status(204).end();
  } catch (err) {
    console.error('logout error:', err);
    return res.status(500).json({ error: 'Could not sign out' });
  }
}

async function changePassword(req, res) {
  try {
    const password = String(req.body?.password || '');
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters`,
      });
    }
    const passwordHash = await hashPassword(password);
    const updated = await authRepository.updatePassword(req.userId, passwordHash);
    if (!updated) throw new Error('Account not found');
    await revokeAll(req.userId);
    return res.status(204).end();
  } catch (err) {
    console.error('changePassword error:', err);
    return res.status(500).json({ error: 'Could not change your password' });
  }
}

async function requestPasswordReset(req, res) {
  // Always return the same response: this public endpoint must not reveal
  // whether an email address is registered.
  const accepted = () => res.status(202).json({ accepted: true });
  try {
    const now = Date.now();
    await authRepository.prune(now);
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (emailError(email)) return accepted();
    const user = await authRepository.getUserByEmail(email);
    if (!user || user.disabled_at) return accepted();
    const state = crypto.randomBytes(32).toString('base64url');
    const redirectBase = config.publicUrls.web.replace(/\/$/, '');
    if (!redirectBase) throw new Error('PUBLIC_WEB_URL is required for password recovery');
    await authRepository.saveResetFlow({
      state_hash: hashToken(state),
      user_id: user.id,
      expires_at: now + 60 * 60 * 1000,
    });
    const resetUrl = `${redirectBase}/reset-password?token=${encodeURIComponent(state)}`;
    await mailer.sendPasswordReset(email, resetUrl);
  } catch (err) {
    console.error('requestPasswordReset error:', err);
  }
  return accepted();
}

async function exchangePasswordReset(req, res) {
  try {
    const token = String(req.body?.token || '');
    if (!token) return res.status(400).json({ error: 'This reset link is invalid or expired.' });
    const now = Date.now();
    const flow = await authRepository.claimResetFlow(hashToken(token), now);
    if (!flow) return res.status(400).json({ error: 'This reset link is invalid or expired.' });

    const ticket = crypto.randomBytes(32).toString('base64url');
    await authRepository.saveResetTicket({
      ticket_hash: hashToken(ticket),
      user_id: flow.user_id,
      expires_at: now + 15 * 60 * 1000,
    });
    return res.json({ ticket });
  } catch (err) {
    console.error('exchangePasswordReset error:', err);
    return res.status(400).json({ error: 'This reset link is invalid or expired.' });
  }
}

async function completePasswordReset(req, res) {
  try {
    const ticket = String(req.body?.ticket || '');
    const password = String(req.body?.password || '');
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters` });
    }
    // Claim before changing the password. Two requests racing with the same
    // ticket must never both succeed with different passwords.
    const claimed = await authRepository.claimResetTicket(hashToken(ticket), Date.now());
    if (!claimed) return res.status(400).json({ error: 'This reset link is invalid or expired.' });
    const updated = await authRepository.updatePassword(claimed.user_id, await hashPassword(password));
    if (!updated) throw new Error('Account not found');
    await revokeAll(claimed.user_id);
    return res.status(204).end();
  } catch (err) {
    console.error('completePasswordReset error:', err);
    return res.status(500).json({ error: 'Could not reset your password' });
  }
}

function merchantPayload(body, ownerId) {
  const name = String(body.business_name || body.merchant_name || '').trim();
  if (!name) return null;
  return {
    owner_id: ownerId,
    name,
    cuisine_type: body.cuisine_type || null,
    description: body.business_description || body.description || null,
    logo_url: body.logo_url || null,
    address: body.business_address || body.address || null,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    is_active: false, // admin still controls public listing/vetting
  };
}

async function ensureMerchantForOwner(ownerId, body) {
  const payload = merchantPayload(body, ownerId);
  if (!payload) return null;

  return merchantRepository.upsertOwnerMerchant(payload);
}

// POST /api/auth/signup  (public)
// Creates the account server-side with its email ALREADY confirmed, so no
// confirmation email is ever needed. The frontend signs in right after, and
// /api/auth/sync then creates the profile with the chosen role.
async function signup(req, res) {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const password = b.password || '';

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const badEmail = emailError(email);
    if (badEmail) {
      return res.status(400).json({ error: badEmail });
    }
    // full_name is written to user_metadata below and again to profiles by
    // /sync. The column is bare text, so without this an unbounded string
    // from the form lands in the database.
    const badName = nameError(b.full_name, 'Name');
    if (badName) {
      return res.status(400).json({ error: badName });
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (String(password).length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
    }
    // Admin accounts are provisioned ONLY via the server-side seed scripts and
    // the ADMIN_EMAILS allow-list — never through public self-registration.
    // Without this guard an attacker could register an as-yet-unclaimed admin
    // email (createUser below auto-confirms it) and then be handed the admin
    // role by the auto-admin-by-email rule in syncProfile. Refuse outright.
    if (config.adminEmails.includes(email)) {
      return res.status(403).json({
        error: 'This email is reserved. Please contact Alabiq support.',
      });
    }
    if (b.role === 'merchant') {
      return res.status(403).json({
        error: 'Restaurant owner accounts are created by Alabiq after partnership approval. Please contact us to get started.',
      });
    }

    let user;
    try {
      user = await authRepository.createUser({ email, passwordHash: await hashPassword(password) });
    } catch (error) {
      if (error.code === '23505') {
        // DELIBERATELY NOT a 409 saying the account exists. This endpoint is
        // public and rate-limited only to 30/hour, so a distinguishable
        // response here is an account-existence oracle: an attacker learns
        // which addresses are registered and feeds them to a credential
        // stuffing list. Answer exactly as a fresh signup does and let the
        // caller find out at sign-in, which is uniform, or through
        // forgot-password, which is already non-enumerating.
        //
        // The frontend signs in right after this returns, so a real owner
        // typing their real password still lands signed in; anyone else gets
        // the generic "email or password is incorrect".
        //
        // Do not "improve" this back into a friendly 409.
        return res.status(201).json({ email });
      }
      console.error('signup error:', error);
      return res.status(500).json({ error: 'Could not create the account. Please try again.' });
    }

    // Same shape as the already-exists branch above, on purpose.
    return res.status(201).json({ email: user.email });
  } catch (err) {
    console.error('signup error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function syncProfile(req, res) {
  try {
    const { id, email } = req.authUser;
    const b = req.body || {};
    const emailLc = (email || '').toLowerCase();

    // /sync takes an open body (buildProfileUpsert reads many optional
    // fields), so it cannot use validateBody, which rejects unknown keys.
    // full_name still needs the same cap the PATCH /profile route applies —
    // this is the other path that writes it.
    const badName = nameError(b.full_name, 'Name');
    if (badName) {
      return res.status(400).json({ error: badName });
    }
    const isAdminEmail = config.adminEmails.includes(emailLc);

    const existing = await profileRepository.getProfileById(id);

    // PRIVILEGE ESCALATION GUARD.
    //
    // Admin is derived from the auth email matching ADMIN_EMAILS. POST /signup
    // refuses those addresses outright (control #3, handbook §13.3.4) — but a
    // user can also change their own auth email AFTER registering, straight
    // from a client-side email change. Without
    // the check below that was a complete bypass:
    //
    //   register as a passenger
    //   -> updateUser({ email: '<a known admin address>' })
    //   -> POST /api/auth/sync
    //   -> role = 'admin', full /api/admin surface
    //
    // Supabase's "Secure email change" setting mitigates it by requiring
    // confirmation at the target address, but a dashboard toggle is not a
    // control we own. An admin-email claim arriving on an ALREADY EXISTING
    // non-admin profile is never legitimate: real admins are provisioned by
    // the seed scripts, which write the profile row with role 'admin' before
    // anyone signs in, so they match the `existing.role === 'admin'` branch.
    // !existing is as important as the role mismatch. /api/auth/signup creates
    // the auth user but NOT the profile row — only this endpoint does — so an
    // attacker could sign up under a throwaway address, change their email to
    // an unclaimed ADMIN_EMAILS one, and arrive here with existing === null,
    // skipping the guard entirely and landing on the role branch below.
    if (isAdminEmail && (!existing || existing.role !== 'admin')) {
      console.error('[SECURITY] admin-email claim without a provisioned admin profile', {
        userId: id,
        email: emailLc,
        currentRole: existing ? existing.role : '(no profile row)',
      });
      return res.status(403).json({
        error: 'This email address is reserved. Please contact Alabiq support.',
      });
    }

    // Decide the role.
    let role;
    if (isAdminEmail || (existing && existing.role === 'admin')) {
      role = 'admin';
    } else if (b.role === 'merchant' && (!existing || existing.role !== 'merchant')) {
      // Block self-service merchant signup; admins provision owner accounts separately.
      return res.status(403).json({
        error: 'Restaurant owner accounts are created by Alabiq after partnership approval. Please contact us to get started.',
      });
    } else if (SELF_ROLES.includes(b.role)) {
      role = b.role;
    } else {
      role = (existing && existing.role) || 'passenger';
    }

    // Production policy: drivers must be verified by an admin (document-based,
    // see driver_documents) before they can carry passengers. New drivers start
    // UNAPPROVED and go through the verification flow; admins are implicitly
    // approved. Existing drivers keep whatever approval they already have.
    const driverApproved = role === 'admin' ? true : (existing ? existing.driver_approved : false);

    const upsertRow = buildProfileUpsert({
      id,
      role,
      email,
      driverApproved,
      existing,
      body: b,
    });
    const profile = await profileRepository.upsertProfile(upsertRow);

    let merchant = null;
    if (profile.role === 'merchant') {
      try {
        merchant = await ensureMerchantForOwner(profile.id, b);
      } catch (merchantErr) {
        console.error('syncProfile merchant setup error:', merchantErr);
        return res.status(500).json({ error: 'Account created, but business profile setup failed.' });
      }
    }

    return res.json(profileJson(profile, merchant));
  } catch (err) {
    console.error('syncProfile error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// PATCH /api/auth/profile  (requireAuth)
// The Profile page: update name / phones / address / avatar. Email and
// password changes go through Supabase Auth on the client — never here.
async function updateProfile(req, res) {
  try {
    const b = req.body; // whitelisted by the route schema
    const patch = {};
    for (const key of ['full_name', 'mobile_number', 'whatsapp_number']) {
      if (key in b) patch[key] = b[key] || null;
    }
    for (const key of ['address', 'avatar_url']) {
      if (key in b) patch[key] = b[key] || null;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const profile = await profileRepository.updateProfile(req.userId, patch);
    if (!profile) {
      console.error('updateProfile error: profile not found');
      return res.status(500).json({ error: 'Could not update your profile' });
    }

    return res.json(profileJson(profile));
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// POST /api/auth/avatar/signed-url  (requireAuth)
// Signed upload for the PUBLIC avatars bucket; the client uploads then
// saves the returned publicUrl via PATCH /api/auth/profile.
async function createAvatarUploadUrlHandler(req, res) {
  try {
    const { file_name, mime_type } = req.body;
    if (!mime_type || !config.avatars.allowedMimeTypes.includes(mime_type)) {
      return res.status(400).json({
        error: `mime_type must be one of: ${config.avatars.allowedMimeTypes.join(', ')}`,
      });
    }

    const path = buildAvatarPath(req.userId, file_name);
    const { token, signedUrl } = await createAvatarUploadUrl(path);

    return res.status(201).json({
      bucket: config.avatars.bucket,
      path,
      token,
      signedUrl,
      publicUrl: avatarPublicUrl(path),
      maxBytes: config.avatars.maxBytes,
    });
  } catch (err) {
    console.error('createAvatarUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

// Work that would be silently orphaned by a deletion. A passenger with a paid
// but undelivered booking, or a driver mid-ride, must finish or cancel first —
// otherwise the trip loses its passenger contact or its driver with no trace.

async function countActiveWork(userId) {
  const database = require('../lib/database/pool');
  const { rows } = await database.query(
    `SELECT
       (SELECT count(*) FROM public.bookings WHERE (user_id=$1 OR assigned_driver_id=$1) AND booking_status NOT IN ('completed','cancelled')) +
       (SELECT count(*) FROM public.orders WHERE customer_id=$1 AND status NOT IN ('delivered','cancelled','rejected')) +
       (SELECT count(*) FROM public.shop_orders WHERE customer_id=$1 AND status NOT IN ('delivered','cancelled','rejected')) AS count`, [userId],
  );
  return Number(rows[0]?.count || 0);
}

// DELETE /api/auth/account  (requireAuth)
// Required by both stores for any app that lets users create an account.
//
// Deletion is destructive but NOT a purge: fare, VAT and payout figures are
// snapshotted onto each order and Saudi tax law requires we keep them. The RPC
// blanks the identifying snapshot, then removing the auth user cascades into
// profiles and drops the order rows to a null customer (migration 0036).
async function deleteAccount(req, res) {
  try {
    const userId = req.userId;

    const profile = await profileRepository.getProfileRole(userId);
    if (!profile) {
      console.error('deleteAccount profile lookup error: profile not found');
      return res.status(500).json({ error: 'Could not load your account' });
    }

    // Merchant and admin accounts are provisioned by an admin rather than
    // self-registered (see SELF_ROLES), and deleting one would strand a live
    // storefront or lock the platform out of its own console.
    if (!SELF_ROLES.includes(profile.role)) {
      return res.status(403).json({
        error:
          'Business and administrator accounts cannot be deleted from the app. Please contact support so we can hand over or close the account properly.',
      });
    }

    const activeWork = await countActiveWork(userId);
    if (activeWork > 0) {
      return res.status(409).json({
        error:
          'You still have a trip or order in progress. Please wait for it to finish, or cancel it, then delete your account.',
      });
    }

    // Best effort: a leftover image is a storage-cost problem, not a reason to
    // leave the user with an account they asked us to remove.
    try {
      await deleteAvatarFolder(userId);
    } catch (err) {
      console.error('deleteAccount avatar cleanup failed:', err);
    }

    const deleted = await authRepository.deleteAccount(userId);
    if (!deleted) {
      console.error('deleteAccount deletion error: user not found');
      return res.status(500).json({
        error: 'Your account could not be deleted right now. Please contact support.',
      });
    }

    return res.status(204).send();
  } catch (err) {
    console.error('deleteAccount error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// POST /api/auth/login-event — the web app calls this once after a
// successful credential sign-in (see AuthProvider.signIn).
//
// ADMINS ONLY. A row per passenger sign-in would be the fastest-growing
// table on the platform and answers a question nobody asked; every other
// role is accepted and ignored so the client never has to know the rule.
//
// Best-effort in the same sense as logAudit: this must never be the reason
// somebody cannot sign in, so a failure is logged and still returns 204.
// requireAuth has already proved the caller is who they say and that their
// profile row exists, which is what makes the foreign key safe.
//
// The client controls WHEN this is called, so a determined admin could
// record extra sign-ins for themselves. That is not worth defending
// against: they can already do everything these rows describe, and the
// alternative (inferring logins server-side from /sync) counts every page
// refresh as a new sign-in, which makes the feature useless.
async function recordLoginEvent(req, res) {
  try {
    if (req.role !== 'admin') return res.status(204).end();

    const ctx = currentContext();
    await authRepository.recordAdminLogin({
      userId: req.userId,
      email: req.authUser.email,
      role: req.role,
      ip: ctx ? ctx.ip : null,
      userAgent: ctx ? ctx.userAgent : null,
    });
    // A missing table (0043 not applied) lands here and is not fatal.
  } catch (err) {
    console.error('recordLoginEvent error:', err.message || err);
  }
  return res.status(204).end();
}

module.exports = {
  login,
  sessionInfo,
  logout,
  changePassword,
  requestPasswordReset,
  exchangePasswordReset,
  completePasswordReset,
  signup,
  recordLoginEvent,
  syncProfile,
  updateProfile,
  createAvatarUploadUrlHandler,
  deleteAccount,
};
