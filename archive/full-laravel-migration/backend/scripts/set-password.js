// Set a chosen password on an existing app-owned PostgreSQL account.
require('dotenv').config();
const authRepository = require('../repositories/authRepository');
const { hashPassword } = require('../lib/passwords');
const { passwordError } = require('../lib/validate');

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}

(async () => {
  const email = String(arg('email') || '').trim().toLowerCase();
  const password = arg('password') || '';
  if (!email) throw new Error('Usage: --email <address> --password <newPassword>');
  const error = passwordError(password);
  if (error) throw new Error(error);
  const user = await authRepository.getUserByEmail(email);
  if (!user) throw new Error(`No account found for ${email}`);
  await authRepository.updatePassword(user.id, await hashPassword(password));
  await authRepository.setDisabled(user.id, false);
  console.log(`Password updated for ${email}.`);
})().catch((error) => {
  console.error('set-password failed:', error.message || error);
  process.exitCode = 1;
});
