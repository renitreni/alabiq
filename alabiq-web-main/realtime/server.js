import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from 'redis';

const port = Number(process.env.PORT || 4100);
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
const publishToken = process.env.REALTIME_PUBLISH_TOKEN || '';
const publisher = createClient({ url: redisUrl });
publisher.on('error', (error) => console.error('realtime redis error:', error.message));
await publisher.connect();

function isAuthorized(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match || !publishToken) return false;
  const actual = Buffer.from(match[1]);
  const expected = Buffer.from(publishToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validTopic(topic) {
  return typeof topic === 'string' && topic.length > 0 && topic.length <= 180 && /^[A-Za-z0-9_-]+$/.test(topic);
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });

  if (req.method === 'POST' && url.pathname === '/publish') {
    if (!isAuthorized(req)) return json(res, 401, { error: 'Unauthorized' });
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 32 * 1024) return json(res, 413, { error: 'Payload too large' });
    }
    try {
      const event = JSON.parse(raw);
      if (!validTopic(event.topic) || typeof event.event !== 'string' || event.event.length > 80) {
        return json(res, 400, { error: 'Invalid event' });
      }
      await publisher.publish(`sm:realtime:${event.topic}`, JSON.stringify({
        event: event.event,
        payload: event.payload ?? {},
      }));
      return json(res, 202, { accepted: true });
    } catch (error) {
      if (error instanceof SyntaxError) return json(res, 400, { error: 'Invalid JSON' });
      console.error('realtime publish failed:', error.message);
      return json(res, 503, { error: 'Realtime unavailable' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/subscribe') {
    const topic = url.searchParams.get('topic');
    if (!validTopic(topic)) return json(res, 400, { error: 'Invalid topic' });
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('event: connected\ndata: {}\n\n');
    let active = true;
    const subscriber = publisher.duplicate();
    subscriber.on('error', (error) => console.error('realtime subscriber error:', error.message));
    try {
      await subscriber.connect();
      await subscriber.subscribe(`sm:realtime:${topic}`, (message) => {
        if (active && !res.writableEnded) res.write(`data: ${message}\n\n`);
      });
    } catch (error) {
      active = false;
      console.error('realtime subscribe failed:', error.message);
      res.end('event: error\ndata: {}\n\n');
      await subscriber.quit().catch(() => {});
      return;
    }
    const heartbeat = setInterval(() => {
      if (active && !res.writableEnded) res.write(': heartbeat\n\n');
    }, 20000);
    req.on('close', () => {
      active = false;
      clearInterval(heartbeat);
      subscriber.unsubscribe(`sm:realtime:${topic}`).finally(() => subscriber.quit()).catch(() => {});
    });
    return;
  }

  return json(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => console.log(`Realtime service listening on ${port}`));
async function shutdown() {
  server.close();
  await publisher.quit().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
