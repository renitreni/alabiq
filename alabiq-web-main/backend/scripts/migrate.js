'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { getPool, close } = require('../lib/database/pool');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations/postgres');
const LOCK_ID = '724318001';

async function runMigrations() {
  const pool = getPool();
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [LOCK_ID]);
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/i.test(name))
      .sort();
    for (const name of files) {
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const applied = await client.query(
        'SELECT checksum FROM public.schema_migrations WHERE name = $1', [name],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum.trim() !== checksum) {
          throw new Error(`Applied migration ${name} was changed; create a new migration instead`);
        }
        console.log(`already applied: ${name}`);
        continue;
      }

      console.log(`applying: ${name}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public.schema_migrations(name, checksum) VALUES ($1, $2)',
          [name, checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${name} failed: ${error.message}`, { cause: error });
      }
    }
    console.log(`PostgreSQL migrations current (${files.length} files)`);
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1::bigint)', [LOCK_ID]).catch(() => {});
    client.release();
    await close();
  }
}

if (require.main === module) {
  runMigrations().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runMigrations, MIGRATIONS_DIR };
