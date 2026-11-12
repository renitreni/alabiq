// ---------------------------------------------------------------------
// Food Delivery auth helpers.
//
//   optionalAuth -> attach req.userId if a valid token is present; never
//                   rejects. Used on public discovery/analytics endpoints
//                   so events can be tagged with a user when one exists.
//
// NOTE: this file only has optionalAuth. requireMerchant lives in
// middleware/auth.js and gates the merchant portal routes
// (routes/merchant.js, routes/merchantShop.js) — it's not needed here
// because admin-side food routes are locked down separately.
// ---------------------------------------------------------------------
const { findSession } = require('../lib/appSessions');
const { setContextUser } = require('../lib/requestContext');

async function optionalAuth(req, _res, next) {
  try {
    const session = await findSession(req);
    if (session?.user) {
      req.authUser = { id: session.user.id, email: session.user.email };
      req.userId = session.user.id;
      // No profile lookup here, so the role stays unknown; id and email
      // are still enough to trace an error to a person.
      setContextUser({ id: session.user.id, email: session.user.email, role: null });
    }
    return next();
  } catch (err) {
    console.error('optionalAuth error:', err);
    return next(); // never block on optional auth
  }
}

module.exports = { optionalAuth };
