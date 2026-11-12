// =====================================================================
// DEMO-ONLY shared helpers.  ⚠️  NOT used by the real app.
//
// Everything under backend/scripts/demo/ exists purely to seed sample data
// for presentations. To strip all demo tooling, delete this whole folder
// and the "seed:demo / seed:pay / seed:request / seed:clean" npm scripts.
// (Run `npm run seed:clean` first to remove demo data from the database.)
//
// Every booking these scripts create is tagged with notes = DEMO_TAG so the
// cleanup script can find and remove exactly the demo rows and nothing else.
// =====================================================================
require('dotenv').config();
const database = require('../../lib/database/pool');
const authRepository = require('../../repositories/authRepository');
const profileRepository = require('../../repositories/profileRepository');
const { hashPassword } = require('../../lib/passwords');

// Marker stamped on every demo booking (notes column). Cleanup keys off this.
const DEMO_TAG = '__DEMO__';

// The demo driver account (also removed by seed:clean). Password comes from
// DEMO_DRIVER_PASSWORD, or is generated per run when the variable is unset.
const DEMO_DRIVER = {
  email: 'driver1@alabiq.com',
  password: process.env.DEMO_DRIVER_PASSWORD || require('node:crypto').randomBytes(9).toString('base64url'),
  full_name: 'Ahmed (Demo Driver)',
  whatsapp_number: '+966512345678',
};

// Riyadh coordinates used across the demo.
const PICKUP = { lat: 24.6913, lng: 46.6852, address: 'Al Olaya, Riyadh' };
const DROPOFF = { lat: 24.9576, lng: 46.7012, address: 'King Khalid Intl — Terminal 1' };
const DRIVER_AT = { lat: 24.72, lng: 46.69 }; // a few km out -> shows a live ETA

const frontendBase = () => process.env.DEMO_FRONTEND_URL || 'http://localhost:5173';

async function findUserByEmail(email) {
  return authRepository.getUserByEmail(email);
}

// Create (or reuse) the approved demo driver; returns its id.
async function ensureDemoDriver() {
  let user = await authRepository.getUserByEmail(DEMO_DRIVER.email);
  if (!user) {
    user = await authRepository.createUser({
      email: DEMO_DRIVER.email,
      passwordHash: await hashPassword(DEMO_DRIVER.password),
    });
  }
  await profileRepository.upsertProfile({
    id: user.id,
    role: 'driver',
    full_name: DEMO_DRIVER.full_name,
    whatsapp_number: DEMO_DRIVER.whatsapp_number,
    email: DEMO_DRIVER.email,
    driver_approved: true,
  });
  return user.id;
}

// Generic insert helper: keys become columns, returns the inserted row.
async function insertRow(table, fields) {
  const names = Object.keys(fields);
  const { rows } = await database.query(
    `INSERT INTO public.${table} (${names.join(',')})
     VALUES (${names.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    names.map((key) => fields[key]),
  );
  return rows[0];
}

// Insert many rows of the same shape in one statement.
async function insertRows(table, rows) {
  if (!rows.length) return;
  const names = Object.keys(rows[0]);
  const values = rows.flatMap((row) => names.map((key) => row[key]));
  const tuples = rows.map(
    (_, r) => `(${names.map((_, c) => `$${r * names.length + c + 1}`).join(',')})`,
  );
  await database.query(
    `INSERT INTO public.${table} (${names.join(',')}) VALUES ${tuples.join(',')}`,
    values,
  );
}

// Common booking fields (always tagged DEMO_TAG). Pass overrides to set status etc.
function demoBooking(overrides = {}) {
  return {
    trip_type: 'house_to_airport',
    airport_terminal: DROPOFF.address,
    pickup_address: PICKUP.address,
    pickup_lat: PICKUP.lat,
    pickup_lng: PICKUP.lng,
    dropoff_address: DROPOFF.address,
    dropoff_lat: DROPOFF.lat,
    dropoff_lng: DROPOFF.lng,
    pickup_datetime: new Date(Date.now() + 3600000).toISOString(),
    passenger_name: 'Sara (Demo Rider)',
    passenger_whatsapp: '+966555555555',
    fare_amount: 103.75,
    currency: 'SAR',
    notes: DEMO_TAG,
    ...overrides,
  };
}

module.exports = {
  database,
  DEMO_TAG,
  DEMO_DRIVER,
  PICKUP,
  DROPOFF,
  DRIVER_AT,
  frontendBase,
  findUserByEmail,
  ensureDemoDriver,
  insertRow,
  insertRows,
  demoBooking,
};
