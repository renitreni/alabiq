const express = require('express');
const router = express.Router();
const database = require('../lib/database/pool');
const { config } = require('../lib/config');

// GET /api/health -> confirms the server runs and can reach PostgreSQL, Redis, and worker.
// Deliberately minimal: this endpoint is public, so it must not disclose
// internal configuration (payment/test mode) or raw error messages.
router.get('/', async (req, res) => {
  const checks = {
    db: 'unknown',
    redis: 'unknown',
    worker: 'unknown',
  };

  // PostgreSQL
  try {
    await database.health();
    checks.db = 'connected';
  } catch (err) {
    checks.db = 'error';
  }

  // Redis (optional)
  if (process.env.REDIS_URL) {
    try {
      const { createClient } = require('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      await client.ping();
      await client.quit();
      checks.redis = 'connected';
    } catch (err) {
      checks.redis = 'error';
    }
  } else {
    checks.redis = 'not_configured';
  }

  // Worker (check if background_jobs table has recent activity)
  try {
    const { rows } = await database.query(
      `SELECT 1 FROM public.background_jobs WHERE lease_owner IS NOT NULL AND lease_expires_at > now() LIMIT 1`
    );
    checks.worker = rows.length > 0 ? 'active' : 'idle';
  } catch (err) {
    checks.worker = 'error';
  }

  const allHealthy = checks.db === 'connected' && (checks.redis === 'connected' || checks.redis === 'not_configured');
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'ok' : 'degraded',
    checks,
    time: new Date().toISOString(),
  });
});

module.exports = router;
