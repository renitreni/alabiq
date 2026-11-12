'use strict';

const database = require('../lib/database/pool');

const WRITABLE_PROFILE_FIELDS = new Set([
  'email', 'full_name', 'role', 'date_of_birth', 'gender', 'national_id',
  'mobile_number', 'whatsapp_number', 'vehicle_type', 'vehicle_plate',
  'driver_approved', 'driver_verification_status', 'service_types',
  'avatar_url', 'address', 'cash_owed', 'cash_owed_limit',
  'is_super_admin', 'disabled_at', 'disabled_by',
]);

function columnsFor(row) {
  const entries = Object.entries(row).filter(([key, value]) =>
    key === 'id' || (WRITABLE_PROFILE_FIELDS.has(key) && value !== undefined));
  if (!entries.some(([key]) => key === 'id')) throw new Error('Profile id is required');
  return entries;
}

async function getProfileById(id) {
  const { rows } = await database.query('SELECT * FROM public.profiles WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getProfileRole(id) {
  const { rows } = await database.query(
    'SELECT id, role, driver_approved, is_super_admin, disabled_at FROM public.profiles WHERE id = $1', [id],
  );
  return rows[0] || null;
}

async function getProfileByEmail(email) {
  const { rows } = await database.query('SELECT id,role,email FROM public.profiles WHERE lower(email)=lower($1) LIMIT 1', [email]);
  return rows[0] || null;
}

async function upsertProfile(row) {
  const entries = columnsFor(row);
  const names = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const updates = names.filter((name) => name !== 'id')
    .map((name) => `${name} = EXCLUDED.${name}`);
  if (!updates.length) updates.push('updated_at = now()');
  const { rows } = await database.query(
    `INSERT INTO public.profiles (${names.join(', ')}) VALUES (${placeholders.join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}, updated_at = now()
     RETURNING *`, values,
  );
  return rows[0];
}

async function updateProfile(id, patch) {
  const entries = Object.entries(patch).filter(([key, value]) =>
    WRITABLE_PROFILE_FIELDS.has(key) && value !== undefined);
  if (!entries.length) return getProfileById(id);
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) => `${key} = $${index + 1}`);
  values.push(id);
  const { rows } = await database.query(
    `UPDATE public.profiles SET ${assignments.join(', ')}, updated_at = now()
     WHERE id = $${values.length} RETURNING *`, values,
  );
  return rows[0] || null;
}

module.exports = { getProfileById, getProfileRole, getProfileByEmail, upsertProfile, updateProfile, WRITABLE_PROFILE_FIELDS };
