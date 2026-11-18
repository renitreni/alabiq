// ---------------------------------------------------------------------
// Driver service-type preferences (migration 0020). A driver picks which
// verticals they work; dispatch and the pull feeds consult this list.
// 'shop' = the Ecommerce vertical. Values reuse the 0007 order_type vocabulary.
// ---------------------------------------------------------------------
const SERVICE_TYPES = ['pick_drop', 'food', 'shop'];

// Null-safe: profiles created before 0020 backfills (or a missing column
// mid-deploy) count as "everything enabled" — today's behavior.
function hasService(profile, svc) {
  const list = (profile && profile.service_types) || SERVICE_TYPES;
  return list.includes(svc);
}

module.exports = { SERVICE_TYPES, hasService };
