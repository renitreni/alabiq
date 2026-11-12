// ---------------------------------------------------------------------
// Notifications controller.
//   - registerToken      : POST   /api/notifications/register
//   - unregisterToken    : POST   /api/notifications/unregister
//   - listMyNotifications : GET    /api/notifications
//
// Collects device push tokens now so native FCM delivery (via the Capacitor
// APK) plugs in later with no client changes. All routes require a signed-in
// user; tokens are always scoped to req.userId.
// ---------------------------------------------------------------------
const database = require('../lib/database/pool');
const { getWebPushConfig } = require('../lib/webPush');

const PLATFORMS = ['android', 'ios', 'web'];

async function registerToken(req, res) {
  try {
    const { token, platform, app_version } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token is required' });
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: `platform must be one of: ${PLATFORMS.join(', ')}` });
    }
    // A browser subscription can only belong to the currently signed-in
    // account. This prevents a shared phone from receiving the previous
    // account's private alerts.
    await database.query(
      `INSERT INTO public.device_push_tokens(user_id,token,platform,app_version,last_seen_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,
         app_version=EXCLUDED.app_version,last_seen_at=now()`,
      [req.userId,token,platform,app_version ?? null],
    );
    return res.status(201).json({ registered: true });
  } catch (err) {
    console.error('registerToken error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

function pushConfig(_req, res) {
  return res.json(getWebPushConfig());
}

async function unregisterToken(req, res) {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token is required' });
    await database.query('DELETE FROM public.device_push_tokens WHERE user_id=$1 AND token=$2', [req.userId,token]);
    return res.json({ unregistered: true });
  } catch (err) {
    console.error('unregisterToken error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function listMyNotifications(req, res) {
  try {
    const { rows } = await database.query(
      `SELECT id,type,channel,booking_id,order_id,shop_order_id,code,read_at,sent_at,created_at
       FROM public.notification_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.userId],
    );
    return res.json({ notifications: rows });
  } catch (err) {
    console.error('listMyNotifications error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function markAllRead(req, res) {
  try {
    const readAt = new Date();
    await database.query('UPDATE public.notification_events SET read_at=$2 WHERE user_id=$1 AND read_at IS NULL', [req.userId,readAt]);
    return res.json({ readAt });
  } catch (err) {
    console.error('markAllRead error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = {
  pushConfig,
  registerToken,
  unregisterToken,
  listMyNotifications,
  markAllRead,
};
