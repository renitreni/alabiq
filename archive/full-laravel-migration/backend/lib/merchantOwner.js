// ---------------------------------------------------------------------
// Shared guard for admin-provisioned merchant owner accounts.
//
// Restaurants (food) and stores (shop) are both onboarded the same way: an
// admin creates the owner's auth account, sets its password and grants it the
// merchant role. Both verticals must refuse the same thing — pointing that
// flow at a Alabiq STAFF account.
//
// Without this guard, "Assign owner" on an email belonging to an admin would
// upsert role:'merchant' over their profile (demoting them) AND overwrite
// their password: a complete takeover of a colleague's admin account, driven
// from inside the admin portal. Mirrors the signup-side refusal in
// authController (handbook §13.3.4) — admin accounts are provisioned ONLY by
// the seed scripts and the ADMIN_EMAILS allow-list.
// ---------------------------------------------------------------------
const { config } = require('./config');
const profileRepository = require('../repositories/profileRepository');

const STAFF_EMAIL_MESSAGE =
  'This email belongs to a Alabiq staff account and cannot be linked as a merchant owner.';

// Look up the profile already registered under `email`, refusing staff accounts.
// Returns either { error, status } — which the caller should send as-is — or
// { profile }, where profile is the existing non-staff row or null when the
// address is unused.
async function resolveOwnerProfile(email) {
  if (config.adminEmails.includes(email)) {
    return { error: STAFF_EMAIL_MESSAGE, status: 403 };
  }

  const profile = await profileRepository.getProfileByEmail(email);

  // Belt-and-suspenders: an admin whose address was removed from ADMIN_EMAILS
  // still carries role 'admin' on their profile row.
  if (profile && profile.role === 'admin') {
    return { error: STAFF_EMAIL_MESSAGE, status: 403 };
  }

  return { profile: profile || null };
}

module.exports = { resolveOwnerProfile, STAFF_EMAIL_MESSAGE };
