'use strict';

const { Pool } = require('pg');
const { config } = require('../config');

let pool;

function getPool() {
  if (!config.database.url) {
    throw new Error('DATABASE_URL is required for the PostgreSQL database adapter');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      max: config.database.poolMax,
      idleTimeoutMillis: config.database.idleTimeoutMs,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      application_name: 'alabiq-api',
    });
    pool.on('error', (error) => console.error('idle PostgreSQL client error:', error.message));
  }
  return pool;
}

async function query(text, values = []) {
  return getPool().query(text, values);
}

async function transaction(work) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function health() {
  await query('SELECT 1');
  return true;
}

async function close() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

module.exports = { getPool, query, transaction, health, close };
