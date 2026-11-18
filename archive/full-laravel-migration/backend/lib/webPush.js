const webpush = require('web-push');
const database = require('./database/pool');

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:support@alabiq.com';
const configured = Boolean(publicKey && privateKey);

if (configured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function getWebPushConfig() {
  return { enabled: configured, publicKey: configured ? publicKey : null };
}

async function removeExpiredSubscription(id) {
  await database.query('DELETE FROM public.device_push_tokens WHERE id=$1', [id]);
}

async function sendWebPush(userId, payload) {
  if (!configured || !userId) return;

  const { rows: tokens } = await database.query(
    "SELECT id,token FROM public.device_push_tokens WHERE user_id=$1 AND platform='web'", [userId],
  );

  await Promise.allSettled(
    (tokens || []).map(async ({ id, token }) => {
      try {
        const subscription = JSON.parse(token);
        await webpush.sendNotification(subscription, JSON.stringify(payload), {
          TTL: 60 * 60,
          urgency: 'high',
        });
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await removeExpiredSubscription(id);
          return;
        }
        console.error('sendWebPush delivery error:', err.message || err);
      }
    })
  );
}

module.exports = { getWebPushConfig, sendWebPush };
