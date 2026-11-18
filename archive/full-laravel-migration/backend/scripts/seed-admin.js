// Create or repair the explicitly configured PostgreSQL admin account.
require('dotenv').config();
const { seedAccount } = require('./lib/seedAccount');

const email = String(process.env.ADMIN_SEED_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_SEED_PASSWORD || '';
if (!email || !email.includes('@')) throw new Error('ADMIN_SEED_EMAIL must be set to a valid email');
if (password.length < 12) throw new Error('ADMIN_SEED_PASSWORD must be at least 12 characters');

seedAccount({
  email, password,
  profile: { role: 'admin', full_name: 'Administrator', driver_approved: true },
}).then(({ created }) => {
  console.log(`${created ? 'Created' : 'Repaired'} PostgreSQL admin account for ${email}.`);
  console.log('Sign in at /login. Ensure this email is present in ADMIN_EMAILS.');
}).catch((error) => {
  console.error('seed-admin failed:', error.message || error);
  process.exitCode = 1;
});
