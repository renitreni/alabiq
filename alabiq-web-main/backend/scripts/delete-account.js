// Inspect an app-owned PostgreSQL account; destructive execution requires --confirm.
require('dotenv').config();
const database = require('../lib/database/pool');
const authRepository = require('../repositories/authRepository');
const profileRepository = require('../repositories/profileRepository');
const { deleteAvatarFolder } = require('../lib/storage');

const email = String(process.argv[2] || '').trim().toLowerCase();
const confirmed = process.argv.includes('--confirm');
if (!email || !email.includes('@')) throw new Error('Usage: node scripts/delete-account.js <email> [--confirm]');

(async () => {
  const user = await authRepository.getUserByEmail(email);
  if (!user) { console.log(`No app account found for ${email}.`); return; }
  const profile = await profileRepository.getProfileById(user.id);
  const { rows } = await database.query(
    `SELECT
       (SELECT count(*) FROM public.bookings WHERE user_id=$1 OR assigned_driver_id=$1)::int AS bookings,
       (SELECT count(*) FROM public.orders WHERE customer_id=$1)::int AS food_orders,
       (SELECT count(*) FROM public.shop_orders WHERE customer_id=$1)::int AS shop_orders,
       (SELECT count(*) FROM public.audit_logs WHERE actor_id=$1)::int AS audit_rows`, [user.id],
  );
  console.log({ email, id:user.id, role:profile?.role || '(no profile)', references:rows[0] });
  if (!confirmed) { console.log('Dry run only. Repeat with --confirm to apply the app deletion and PII scrub.'); return; }
  try {
    await deleteAvatarFolder(user.id);
  } catch (error) {
    console.warn('Avatar cleanup failed; continuing with account removal:', error.message);
  }
  const deleted = await authRepository.deleteAccount(user.id);
  if (!deleted) throw new Error('Account was not deleted');
  console.log(`Deleted app account ${email} (${user.id}).`);
})().catch((error) => {
  console.error('delete-account failed:', error.message || error);
  process.exitCode = 1;
});
