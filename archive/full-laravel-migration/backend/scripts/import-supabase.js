// ---------------------------------------------------------------------
// Import production data exported from Supabase into the standalone
// PostgreSQL baseline. Companion to supabase-export.sql, which produces
// one CSV per table (plus auth_users.csv) from the Supabase database.
//
// WHY THIS EXISTS: the pre-Drop-Supabase schema lives in Supabase with
// auth.users and Supabase Storage; the standalone baseline is column-for-
// column identical for all public tables (verified by diff), so the import
// is a straight copy that preserves UUIDs. FK references to auth.users
// become references to app_users because the UUIDs are kept.
//
// Password hashes: Supabase GoTrue stores bcrypt (`$2a$/$2b$`). They are
// imported as-is and verified transparently by lib/passwords.js, which
// re-hashes to scrypt on the user's first successful login.
//
// Usage (against the TARGET database, e.g. inside the api container):
//
//   node scripts/import-supabase.js import --dir /import/csv
//   node scripts/import-supabase.js verify --dir /import/csv
//   node scripts/import-supabase.js cleanup
//
// - import: loads every <table>.csv into import_staging, fills app_users
//   from auth_users.csv, copies staging -> public (idempotent, skips
//   existing rows), and prints a per-table report.
// - verify: count comparison staging vs public + orphan checks, no writes.
// - cleanup: drops the import_staging schema after a successful cutover.
//
// SAFETY: refuses to run if any app_sessions rows exist (sessions only
// appear once the API serves logins — i.e. the new stack went live).
// ---------------------------------------------------------------------
'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { getPool, close } = require('../lib/database/pool');
const { hashPassword } = require('../lib/passwords');
const copyStreams = require('pg-copy-streams');

const STAGING = 'import_staging';
const AUTH_CSV = 'auth_users.csv';

// auth_users.csv columns (must match supabase-export.sql).
const AUTH_COLUMNS = [
  'id', 'email', 'encrypted_password', 'email_confirmed_at', 'last_sign_in_at',
  'created_at', 'updated_at', 'banned_until', 'deleted_at', 'is_anonymous',
];

function parseArgs(argv) {
  const [command = 'import'] = argv;
  const dirIdx = argv.indexOf('--dir');
  return {
    command,
    dir: dirIdx >= 0 ? path.resolve(argv[dirIdx + 1]) : path.resolve(process.cwd(), 'csv'),
  };
}

function readCsvHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(65536);
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytes).toString('utf8').split('\n')[0];
    if (!firstLine) throw new Error(`${path.basename(file)}: empty file`);
    return firstLine.trim().split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  } finally {
    fs.closeSync(fd);
  }
}

async function ensureStaging(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${STAGING}`);
}

async function targetColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`, [table],
  );
  return new Set(rows.map((r) => r.column_name));
}

async function loadCsvIntoStaging(client, dir, table) {
  const file = path.join(dir, `${table}.csv`);
  if (!fs.existsSync(file)) return { table, status: 'missing', rows: 0 };
  const header = readCsvHeader(file);
  const target = await targetColumns(client, table);
  const columns = header.filter((c) => {
    if (!target.has(c)) {
      console.warn(`  ${table}: CSV column "${c}" not in target schema — ignored`);
      return false;
    }
    return true;
  });
  if (!columns.length) return { table, status: 'no-matching-columns', rows: 0 };

  await client.query(`DROP TABLE IF EXISTS ${STAGING}.${table}`);
  await client.query(`CREATE TABLE ${STAGING}.${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
  await client.query(`TRUNCATE ${STAGING}.${table}`);

  const sql = `COPY ${STAGING}.${table} (${columns.map((c) => `"${c}"`).join(',')}) FROM STDIN WITH CSV HEADER`;
  const copyFrom = copyStreams.from(sql);
  const stream = client.query(copyFrom);
  await pipeline(fs.createReadStream(file), stream);
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${STAGING}.${table}`);
  return { table, status: 'loaded', rows: rows[0].n, columns: columns.length };
}

async function importAuthUsers(client, dir) {
  const file = path.join(dir, AUTH_CSV);
  if (!fs.existsSync(file)) throw new Error(`${AUTH_CSV} not found in ${dir}`);
  const header = readCsvHeader(file);
  for (const col of AUTH_COLUMNS) {
    if (!header.includes(col)) throw new Error(`${AUTH_CSV} is missing column "${col}"`);
  }

  await client.query(`DROP TABLE IF EXISTS ${STAGING}.auth_users`);
  await client.query(
    `CREATE TABLE ${STAGING}.auth_users (
      id uuid, email text, encrypted_password text,
      email_confirmed_at timestamptz, last_sign_in_at timestamptz,
      created_at timestamptz, updated_at timestamptz,
      banned_until timestamptz, deleted_at timestamptz, is_anonymous boolean)`,
  );
  const sql = `COPY ${STAGING}.auth_users (${AUTH_COLUMNS.join(',')}) FROM STDIN WITH CSV HEADER`;
  const copyFrom = copyStreams.from(sql);
  const stream = client.query(copyFrom);
  await pipeline(fs.createReadStream(file), stream);

  // Marker hash for accounts that have no password (phone/anonymous-only
  // users in Supabase). It matches no password; the account stays locked
  // until the user goes through password reset.
  const unusableHash = await hashPassword(`unmigrated-${require('node:crypto').randomBytes(16).toString('hex')}`);
  const { rows: [totals] } = await client.query(
    `WITH moved AS (
       INSERT INTO public.app_users
         (id, email, password_hash, email_verified_at, last_login_at,
          created_at, updated_at, disabled_at)
       SELECT s.id,
              lower(btrim(s.email)),
              CASE WHEN nullif(s.encrypted_password, '') IS NULL
                   THEN $1 ELSE s.encrypted_password END,
              s.email_confirmed_at,
              s.last_sign_in_at,
              coalesce(s.created_at, now()),
              coalesce(s.updated_at, s.created_at, now()),
              CASE WHEN s.banned_until IS NOT NULL AND s.banned_until > now()
                   THEN s.banned_until END
       FROM ${STAGING}.auth_users s
       WHERE s.deleted_at IS NULL
         AND nullif(btrim(s.email), '') IS NOT NULL
         AND s.is_anonymous IS NOT TRUE
       ON CONFLICT (id) DO NOTHING
       RETURNING 1
     )
     SELECT (SELECT count(*)::int FROM ${STAGING}.auth_users) AS source,
            (SELECT count(*)::int FROM moved) AS inserted`, [unusableHash],
  );
  const skipped = totals.source - totals.inserted;
  console.log(`app_users: ${totals.inserted} imported from ${totals.source} auth.users rows (${skipped} skipped: deleted/anonymous/no-email/already-present)`);
  return totals;
}

async function copyStagingToPublic(client) {
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_name <> 'auth_users' ORDER BY table_name`, [STAGING],
  );
  await client.query(`SET LOCAL session_replication_role = replica`);
  for (const { table_name: table } of tables) {
    const { rows: [counts] } = await client.query(
      `WITH moved AS (
         INSERT INTO public.${table} SELECT * FROM ${STAGING}.${table}
         ON CONFLICT DO NOTHING
         RETURNING 1
       )
       SELECT (SELECT count(*)::int FROM ${STAGING}.${table}) AS source,
              (SELECT count(*)::int FROM moved) AS inserted`, [],
    );
    console.log(`${table}: ${counts.inserted}/${counts.source} rows`);
  }
}

async function verify(client) {
  const { rows: [orphans] } = await client.query(
    `SELECT count(*)::int AS n FROM public.profiles p
     WHERE NOT EXISTS (SELECT 1 FROM public.app_users u WHERE u.id = p.id)`,
  );
  console.log(`orphan profiles (no matching app_users row): ${orphans.n}`);
  const { rows: sessions } = await client.query('SELECT count(*)::int AS n FROM public.app_sessions');
  console.log(`app_users total: ${(await client.query('SELECT count(*)::int AS n FROM public.app_users')).rows[0].n}`);
  console.log(`app_sessions (must stay 0 until cutover): ${sessions[0].n}`);
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_name <> 'auth_users' ORDER BY table_name`, [STAGING],
  );
  for (const { table_name: table } of tables) {
    const { rows: [counts] } = await client.query(
      `SELECT (SELECT count(*)::int FROM ${STAGING}.${table}) AS source,
              (SELECT count(*)::int FROM public.${table}) AS final`, [],
    );
    const flag = counts.final < counts.source ? '  <-- SHORT' : '';
    console.log(`${table}: staging=${counts.source} public=${counts.final}${flag}`);
  }
}

async function assertNoLiveTraffic(client) {
  const { rows: [r] } = await client.query('SELECT count(*)::int AS n FROM public.app_sessions');
  if (r.n > 0) {
    throw new Error(
      `Refusing to import: ${r.n} app_sessions row(s) exist. ` +
      'Sessions appear once the new API serves logins; imports are only safe before cutover.',
    );
  }
}

async function main() {
  const { command, dir } = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const client = await pool.connect();
  try {
    if (command === 'cleanup') {
      await client.query(`DROP SCHEMA IF EXISTS ${STAGING} CASCADE`);
      console.log(`dropped schema ${STAGING}`);
      return;
    }
    if (!fs.existsSync(dir)) throw new Error(`CSV directory not found: ${dir}`);
    await client.query('BEGIN');
    try {
      await assertNoLiveTraffic(client);
      await ensureStaging(client);
      if (command === 'import') {
        await importAuthUsers(client, dir);
        const csvs = fs.readdirSync(dir).filter((f) => f.endsWith('.csv') && f !== AUTH_CSV);
        for (const file of csvs.sort()) {
          const result = await loadCsvIntoStaging(client, dir, file.replace(/\.csv$/, ''));
          if (result.status !== 'loaded') console.log(`${result.table}: ${result.status}`);
        }
        await copyStagingToPublic(client);
        console.log('--- verification ---');
        await verify(client);
        console.log('Import complete. Review the report, then run the storage-file copy and');
        console.log('scripts/migrate-public-media-urls.js --apply. After a stable cutover, run');
        console.log('`node scripts/import-supabase.js cleanup` to drop the staging schema.');
      } else if (command === 'verify') {
        await verify(client);
      } else {
        throw new Error(`Unknown command "${command}". Use: import | verify | cleanup`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    client.release();
    await close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
