const express = require('express');
const database = require('../lib/database/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const PUBLIC_TOPIC = /^(booking-SM-[A-Za-z0-9-]+|fd-order-FD-[A-Za-z0-9-]+|shop-order-SH-[A-Za-z0-9-]+)$/;

async function authorize(req, topic) {
  if (PUBLIC_TOPIC.test(topic)) return true;
  const user = await authenticate(req);
  if (!user) return false;
  const { rows: profiles } = await database.query(
    'SELECT role,driver_approved FROM public.profiles WHERE id=$1 LIMIT 1', [user.id]);
  const profile = profiles[0];
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (topic === 'drivers-available') return profile.role === 'driver' && profile.driver_approved;
  if (topic === `driver-${user.id}`) return profile.role === 'driver';
  const merchant = topic.match(/^merchant-([0-9a-f-]{36})$/i);
  if (merchant && profile.role === 'merchant') {
    const { rows } = await database.query(
      'SELECT id FROM public.merchants WHERE id=$1 AND owner_id=$2 LIMIT 1', [merchant[1],user.id]);
    return rows.length > 0;
  }
  return false;
}

router.get('/', async (req, res) => {
  const topic = String(req.query.topic || '');
  try {
    if (!(await authorize(req, topic))) return res.status(403).json({ error: 'Event access denied' });
  } catch (err) {
    console.error('event authorization failed:', err);
    return res.status(503).json({ error: 'Live updates are temporarily unavailable' });
  }
  const base = process.env.REALTIME_INTERNAL_URL || 'http://realtime:4100';
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  let connectTimer;
  try {
    connectTimer = setTimeout(() => abort.abort(), 5000);
    const upstream = await fetch(
      `${base}/subscribe?topic=${encodeURIComponent(topic)}`,
      { signal: abort.signal },
    );
    clearTimeout(connectTimer);
    if (!upstream.ok || !upstream.body) {
      if (!res.headersSent) return res.status(503).json({ error: 'Live updates are temporarily unavailable' });
      return res.end('event: error\ndata: {}\n\n');
    }
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    for await (const chunk of upstream.body) {
      if (res.writableEnded) break;
      if (!res.write(chunk)) await new Promise((resolve) => res.once('drain', resolve));
    }
    if (!res.writableEnded) res.end();
  } catch (err) {
    clearTimeout(connectTimer);
    if (err.name !== 'AbortError') {
      console.error('realtime subscription failed:', err.message);
      if (res.headersSent) res.end('event: error\ndata: {}\n\n');
      else res.status(503).json({ error: 'Live updates are temporarily unavailable' });
    }
  }
});

module.exports = router;
