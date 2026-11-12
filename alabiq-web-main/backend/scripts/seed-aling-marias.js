// ---------------------------------------------------------------------
// Seed (or repair) Aling Maria's Specialties — listed restaurant with
// no menu yet (customers see a "menu coming soon" alert on the food home).
//
//   npm run seed:aling-marias
// ---------------------------------------------------------------------
require('dotenv').config();
const database = require('../lib/database/pool');

const MERCHANT = {
  name: "Aling Maria's Specialties",
  cuisine_type: 'Filipino',
  description: '100% all natural, finest quality ingredients — food crafted, made with love.',
  logo_url: '/brands/aling-marias.png',
  address: 'Riyadh, Saudi Arabia',
  is_active: true,
  status: 'active',
  is_featured: true,
  badge: 'new',
  service_radius_km: 15,
};

async function run() {
  const { rows: existing } = await database.query(
    `SELECT id, name FROM public.merchants WHERE name ILIKE $1 LIMIT 1`, ['%aling maria%'],
  );

  if (existing[0]?.id) {
    const sets = Object.keys(MERCHANT).map((key, i) => `${key}=$${i + 2}`).join(',');
    await database.query(
      `UPDATE public.merchants SET ${sets} WHERE id=$1`, [existing[0].id, ...Object.values(MERCHANT)],
    );
    console.log(`✅ Updated Aling Maria's Specialties (${existing[0].id}) — no menu items (coming soon).`);
    return;
  }

  const names = Object.keys(MERCHANT);
  const { rows: created } = await database.query(
    `INSERT INTO public.merchants (${names.join(',')})
     VALUES (${names.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id, name`,
    names.map((key) => MERCHANT[key]),
  );
  console.log(`✅ Created Aling Maria's Specialties (${created[0].id}) — listed with empty menu.`);
}

run().catch((err) => {
  console.error('seed-aling-marias failed:', err.message || err);
  process.exit(1);
});
