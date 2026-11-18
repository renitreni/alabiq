// ---------------------------------------------------------------------
// Error messages that mention our own INTERNALS — "run migration 00xx",
// SQL file paths, table names.
//
// Those details are useful to an admin doing QA and meaningless (and a
// little alarming) to a customer, so the operational hint is only attached
// for admins. Everyone else gets a plain "temporarily unavailable" line.
//
// Usage:
//   return res.status(409).json(
//     opsError(req, 'Profile pictures are temporarily unavailable.',
//              'Run backend/migrations/0024_profile_and_contact.sql in the Supabase SQL Editor.')
//   );
// ---------------------------------------------------------------------

// The public-facing sentence, plus the internal hint when an admin is asking.
// `req.role` is set by requireAuth (middleware/auth.js).
function opsError(req, publicMessage, adminHint) {
  const isAdmin = !!req && (req.role === 'admin' || !!req.adminId);
  return {
    error: isAdmin && adminHint ? `${publicMessage} ${adminHint}` : publicMessage,
    ...(isAdmin && adminHint ? { adminHint } : {}),
  };
}

module.exports = { opsError };
