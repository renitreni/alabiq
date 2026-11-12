// ---------------------------------------------------------------------
// Auth middleware for app-owned bearer sessions backed by PostgreSQL.
//
//   requireToken          -> valid token only (profile may not exist yet)
//   requireAuth           -> valid token + an existing profile  (req.userId)
//   requireAdmin          -> requireAuth + role 'admin'         (req.adminId)
//   requireDriver         -> requireAuth + role 'driver'        (req.driverId)
//   requireMerchant       -> requireAuth + role 'merchant'      (req.merchantOwnerId)
//   requireMerchantVertical('food'|'shop')
//                         -> requireMerchant + that merchant's vertical (req.merchant)
//   requireApprovedDriver -> requireDriver + driver_approved = true
// ---------------------------------------------------------------------
const { findSession } = require('../lib/appSessions');
const { setContextUser } = require('../lib/requestContext');
const profileRepository = require('../repositories/profileRepository');
const merchantRepository = require('../repositories/merchantRepository');

async function authenticate(req) {
  const session = await findSession(req);
  if (!session) return null;
  req.appSessionId = session.id;
  return session.user;
}

async function requireToken(req, res, next) {
  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.authUser = { id: user.id, email: user.email };
    return next();
  } catch (err) {
    console.error('requireToken error:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

async function requireAuth(req, res, next) {
  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.authUser = { id: user.id, email: user.email };

    const profile = await profileRepository.getProfileById(user.id);

    if (!profile) {
      return res.status(403).json({ error: 'Profile not set up. Please complete registration.' });
    }
    // Deactivated accounts are checked on every authenticated request, not only at sign in.
    if (profile.disabled_at) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }
    req.profile = profile;
    req.role = profile.role;
    req.userId = profile.id;
    // Every other guard composes through this one, so this is what puts a
    // name against a row in the admin Errors page.
    setContextUser({ id: profile.id, email: user.email, role: profile.role });
    return next();
  } catch (err) {
    console.error('requireAuth error:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.adminId = req.userId;
    return next();
  });
}

function requireDriver(req, res, next) {
  requireAuth(req, res, () => {
    // Admins may exercise driver routes for testing (the admin "preview as
    // driver" view) — admin passes any role check; routes are not duplicated.
    if (req.role !== 'driver' && req.role !== 'admin') {
      return res.status(403).json({ error: 'Driver access required' });
    }
    req.driverId = req.userId;
    return next();
  });
}

function requireMerchant(req, res, next) {
  requireAuth(req, res, () => {
    if (req.role !== 'merchant' && req.role !== 'admin') {
      return res.status(403).json({ error: 'Business owner access required' });
    }
    req.merchantOwnerId = req.userId;
    return next();
  });
}

// Merchants are single-vertical: merchants.owner_id is UNIQUE, so an owner
// maps to exactly one merchant, and that row's `vertical` (migration 0026)
// decides which portal they get. This guard keeps a restaurant owner out of
// the store API and vice versa.
//
// It attaches req.merchant so the controller does not re-query, and it 403s
// rather than 404s: the caller IS a merchant, just not of this kind, and
// pretending the endpoint does not exist would be misleading to a real user.
// Admins bypass, consistent with every other guard here.
function requireMerchantVertical(vertical) {
  return function guard(req, res, next) {
    requireMerchant(req, res, async () => {
      // requireAuth invokes this callback without awaiting it, so an
      // unhandled rejection here would surface as a process-level crash on
      // Node >= 15. Everything below is wrapped.
      try {
        const data = await merchantRepository.getByOwner(req.merchantOwnerId);
        // Admin bypass. It still runs the lookup first so req.merchant is
        // populated when the admin happens to own a merchant row — an
        // earlier version returned early and 404'd admins across the whole
        // portal, because every controller resolves the store from
        // req.merchantOwnerId.
        if (req.role === 'admin') {
          if (data) req.merchant = data;
          return next();
        }
        if (!data) {
          return res.status(404).json({ error: 'No business profile is linked to this account' });
        }
        if ((data.vertical || 'food') !== vertical) {
          return res.status(403).json({
            error:
              vertical === 'shop'
                ? 'This account manages a restaurant, not a store'
                : 'This account manages a store, not a restaurant',
          });
        }
        req.merchant = data;
        return next();
      } catch (err) {
        console.error('requireMerchantVertical error:', err);
        return res.status(500).json({ error: 'Unexpected server error' });
      }
    });
  };
}

function requireApprovedDriver(req, res, next) {
  requireDriver(req, res, () => {
    // Admin bypasses the approval gate (admins are implicitly approved).
    if (req.role !== 'admin' && !req.profile.driver_approved) {
      // Otherwise-invisible rejection (e.g. the driver's location pings just
      // vanish client-side) — log it so a revoked/pending approval shows up
      // in server logs instead of looking like a random dead GPS feed.
      console.warn('[auth] 403 not-approved-driver', { userId: req.userId, path: req.originalUrl });
      return res.status(403).json({ error: 'Your driver account is pending admin approval' });
    }
    return next();
  });
}

module.exports = {
  authenticate,
  requireToken,
  requireAuth,
  requireAdmin,
  requireDriver,
  requireMerchant,
  requireMerchantVertical,
  requireApprovedDriver,
};
