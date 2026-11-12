// Provision the bootstrap super admin in PostgreSQL. Do not add this email to ADMIN_EMAILS.
require('dotenv').config();
const crypto = require('node:crypto');
const { seedAccount } = require('./lib/seedAccount');

const account = { email: 'ferdzsabado@alabiq.com', full_name: 'Ferdz Sabado' };
const chosen = String(process.env.SUPER_ADMIN_PASSWORD || '').trim();
if (chosen && chosen.length < 12) throw new Error('SUPER_ADMIN_PASSWORD must be at least 12 characters');
const password = chosen || crypto.randomBytes(15).toString('base64url');

seedAccount({
  ...account, password,
  profile: { role: 'admin', full_name: account.full_name, driver_approved: true, is_super_admin: true, disabled_at: null, disabled_by: null },
}).then(({ created }) => {
  console.log(`Super admin ${created ? 'created' : 'repaired'} for ${account.email}.`);
  console.log(`Password: ${chosen ? '(SUPER_ADMIN_PASSWORD supplied)' : password}`);
  console.log('Change the generated password after first sign-in; do not add this address to ADMIN_EMAILS.');
}).catch((error) => {
  console.error('seed-super-admin failed:', error.message || error);
  process.exitCode = 1;
});
