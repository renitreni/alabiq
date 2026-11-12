'use strict';

const authRepository = require('../../repositories/authRepository');
const profileRepository = require('../../repositories/profileRepository');
const { hashPassword } = require('../../lib/passwords');

async function seedAccount({ email, password, profile }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await authRepository.getUserByEmail(normalizedEmail);
  const passwordHash = await hashPassword(password);
  let user = existing;
  if (existing) {
    await authRepository.updatePassword(existing.id, passwordHash);
    await authRepository.setDisabled(existing.id, false);
  } else {
    user = await authRepository.createUser({ email: normalizedEmail, passwordHash });
  }
  await profileRepository.upsertProfile({ ...profile, id: user.id, email: normalizedEmail });
  return { id: user.id, created: !existing };
}

module.exports = { seedAccount };
