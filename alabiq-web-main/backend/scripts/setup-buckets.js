// ---------------------------------------------------------------------
// Create configured object-storage buckets if missing.
//
// WHY THIS IS A SCRIPT, NOT A BOOT STEP: bucket limits are a ceiling on
// what customers can upload. Moving one should be a deliberate act with a
// person watching, not something a process restart does silently.
//
// Size and MIME limits are enforced by the API before accepting uploads.
// Bucket creation is a separate idempotent setup action.
//
//   node scripts/setup-buckets.js
//
// Idempotent. Safe to re-run, and safe to run against production.
// ---------------------------------------------------------------------
require('dotenv').config();

const { config } = require('../lib/config');
const { ensureBucket } = require('../lib/storage');

const BUCKETS = [
  // PRIVATE. Payment screenshots, read by admins through signed URLs.
  { name: config.proofs.bucket, isPublic: false, spec: config.proofs },
  // PRIVATE. KYC documents — licences, IDs, registrations.
  { name: config.driverDocs.bucket, isPublic: false, spec: config.driverDocs },
  // PUBLIC. Logos and menu photos, served straight into <img src>.
  { name: config.merchantImages.bucket, isPublic: true, spec: config.merchantImages },
  // PUBLIC. Created lazily by the backend already; included so one run
  // leaves every bucket in a known state.
  { name: config.avatars.bucket, isPublic: true, spec: config.avatars },
];

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

async function main() {
  let failed = 0;

  for (const { name, isPublic, spec } of BUCKETS) {
    try {
      const result = await ensureBucket(name, {
        isPublic,
        maxBytes: spec.maxBytes,
        allowedMimeTypes: spec.allowedMimeTypes,
      });
      console.log(
        `[ok] ${name.padEnd(18)} ${result.action.padEnd(8)} ` +
          `limit ${mb(spec.maxBytes).padStart(6)}  ` +
          `${isPublic ? 'public ' : 'private'}  ${spec.allowedMimeTypes.join(', ')}`
      );
    } catch (err) {
      failed += 1;
      console.error(`[FAIL] ${name}: ${err.message}`);
    }
  }

  if (failed) {
    console.error(`\n${failed} bucket(s) could not be configured.`);
    process.exit(1);
  }
  console.log('\nAll object-storage buckets configured.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
