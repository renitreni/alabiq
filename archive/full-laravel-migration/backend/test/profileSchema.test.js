require('./helpers/pureEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProfileUpsert } = require('../lib/profileSchema');

test('profile upsert includes every app-owned profile field while preserving existing role state', () => {
  const row = buildProfileUpsert({
    id: 'profile-1', email: 'a@example.com', role: 'driver', driverApproved: false,
    existing: { role: 'driver' },
    body: {
      full_name: 'A Driver', date_of_birth: '1990-01-01', gender: 'other', national_id: 'id-1',
      vehicle_type: 'sedan', vehicle_plate: 'ABC-123', address: 'Main Street', avatar_url: 'https://img',
    },
  });
  assert.equal(row.id, 'profile-1');
  assert.equal(row.role, 'driver');
  assert.equal(row.driver_approved, false);
  assert.equal(row.date_of_birth, '1990-01-01');
  assert.equal(row.avatar_url, 'https://img');
});

test('new profiles initialize optional name but do not overwrite absent fields for existing users', () => {
  const fresh = buildProfileUpsert({ id: 'new', role: 'passenger', body: {} });
  const existing = buildProfileUpsert({ id: 'old', role: 'passenger', existing: { full_name: 'Keep' }, body: {} });
  assert.equal(fresh.full_name, null);
  assert.equal(Object.hasOwn(existing, 'full_name'), false);
});
