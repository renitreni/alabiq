// DEMO-ONLY — create (or reuse) 5 demo customer accounts located in Riyadh.
//   npm run seed:customers
//
// Each customer is an app_users row + a profiles row (role 'passenger') with
// an address in a different Riyadh district. Emails follow the pattern
// demo.customerN@alabiq.com so `npm run seed:clean` can find them.
const { findUserByEmail } = require('./_demo-lib');
const authRepository = require('../../repositories/authRepository');
const profileRepository = require('../../repositories/profileRepository');
const { hashPassword } = require('../../lib/passwords');

// Password comes from DEMO_CUSTOMER_PASSWORD, or is generated per run when unset.
const DEMO_PASSWORD = process.env.DEMO_CUSTOMER_PASSWORD
  || require('node:crypto').randomBytes(9).toString('base64url');

const DEMO_CUSTOMERS = [
  { email: 'demo.customer1@alabiq.com', full_name: 'Sara Alotaibi (Demo)', whatsapp_number: '+966501234567', address: 'Al Olaya, Riyadh' },
  { email: 'demo.customer2@alabiq.com', full_name: 'Mohammed Alharbi (Demo)', whatsapp_number: '+966502345678', address: 'Al Malqa, Riyadh' },
  { email: 'demo.customer3@alabiq.com', full_name: 'Noura Alqhtani (Demo)', whatsapp_number: '+966503456789', address: 'Hittin, Riyadh' },
  { email: 'demo.customer4@alabiq.com', full_name: 'Khalid Alsubaie (Demo)', whatsapp_number: '+966504567890', address: 'Al Rawdah, Riyadh' },
  { email: 'demo.customer5@alabiq.com', full_name: 'Reem Aldossari (Demo)', whatsapp_number: '+966505678901', address: 'Al Narjis, Riyadh' },
];

async function run() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const c of DEMO_CUSTOMERS) {
    let user = await findUserByEmail(c.email);
    if (!user) {
      user = await authRepository.createUser({ email: c.email, passwordHash });
    }
    await profileRepository.upsertProfile({
      id: user.id,
      role: 'passenger',
      full_name: c.full_name,
      whatsapp_number: c.whatsapp_number,
      email: c.email,
      address: c.address,
    });
    console.log(`✓ ${c.full_name.padEnd(24)} ${c.email}  — ${c.address}`);
  }

  console.log(`\n✅ ${DEMO_CUSTOMERS.length} demo customers ready (all located in Riyadh)`);
  console.log(`   Password for all demo customers: ${DEMO_PASSWORD}\n`);
}

run().catch((e) => { console.error('seed-customers failed:', e.message || e); process.exit(1); });
