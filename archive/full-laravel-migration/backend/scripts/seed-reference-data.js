'use strict';

require('dotenv').config();
const { query, close } = require('../lib/database/pool');

// Safe platform defaults only: no accounts, passwords, merchant data, or demo orders.
const DEFAULTS = [
  ['max_distance_km', null],
  ['stcpay_enabled', true],
];

async function seedReferenceData() {
  for (const [key, value] of DEFAULTS) {
    await query(
      `INSERT INTO public.app_settings(key, value)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value)],
    );
  }
  console.log(`Reference settings ready (${DEFAULTS.length} defaults; existing values preserved)`);
}

if (require.main === module) {
  seedReferenceData()
    .catch((error) => {
      console.error(`Reference-data seed failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(close);
}

module.exports = { seedReferenceData, DEFAULTS };
