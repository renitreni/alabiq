const express = require('express');
const router = express.Router();
const database = require('../lib/database/pool');

// GET /api/health -> confirms the server runs and can reach PostgreSQL.
// Deliberately minimal: this endpoint is public, so it must not disclose
// internal configuration (payment/test mode) or raw error messages.
router.get('/', async (req, res) => {
  try {
    await database.health();
    res.json({
      status: 'ok',
      db: 'connected',
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error('health check error:', err);
    res.status(500).json({ status: 'error' });
  }
});

module.exports = router;
