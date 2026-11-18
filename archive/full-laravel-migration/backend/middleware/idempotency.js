// ---------------------------------------------------------------------
// Idempotency middleware for checkout / payment endpoints.
//
// Clients send an `Idempotency-Key` header; retries of the same request
// (same user + route + key) replay the ORIGINAL response instead of
// re-executing — so a flaky network can't create two orders or double-
// record a payment. In-memory per process, which matches how rate
// limiting already works here (single VPS; best-effort per instance on
// serverless). Gateway webhooks get DB-level idempotency on top via the
// unique order_payments.gateway_transaction_id index.
// ---------------------------------------------------------------------

const TTL_MS = 10 * 60 * 1000; // remember completed requests for 10 minutes
// A request that never produced a response holds its key for far less time.
// Long enough to still be in flight; short enough that a crashed handler does
// not lock the customer out of their own checkout for ten minutes.
const PENDING_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 1000;

const store = new Map(); // key -> { state: 'pending'|'done', status, body, at }

function prune() {
  const now = Date.now();
  for (const [key, entry] of store) {
    const ttl = entry.state === 'pending' ? PENDING_TTL_MS : TTL_MS;
    if (now - entry.at > ttl) store.delete(key);
  }
  // Hard cap so a key-spamming client can't grow memory unbounded.
  while (store.size > MAX_ENTRIES) {
    store.delete(store.keys().next().value);
  }
}

function idempotent(req, res, next) {
  const key = req.get('idempotency-key');
  if (!key) return next(); // header is optional; without it behave normally

  const mapKey = `${req.userId || 'anon'}:${req.method}:${req.baseUrl}${req.path}:${key}`;
  prune();

  const existing = store.get(mapKey);
  if (existing) {
    if (existing.state === 'pending') {
      return res.status(409).json({ error: 'This request is already being processed' });
    }
    res.set('Idempotency-Replayed', 'true');
    return res.status(existing.status).json(existing.body);
  }

  store.set(mapKey, { state: 'pending', at: Date.now() });

  // Capture the response so an identical retry can replay it -- but only
  // when replaying is the RIGHT answer.
  //
  // A 4xx means the client sent something we refused and nothing was
  // written, so the key must be released: checkout pages mint one key per
  // mount, so caching the 422 for "outside delivery radius" replayed that
  // same refusal for ten minutes after the customer fixed their address,
  // with no way out but a hard reload.
  //
  // A 5xx is the opposite case. The request may have half-succeeded before
  // it blew up, so a retry could create a second order -- exactly what this
  // middleware exists to prevent. Those stay cached.
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const status = res.statusCode;
    if (status >= 400 && status < 500) store.delete(mapKey);
    else store.set(mapKey, { state: 'done', status, body, at: Date.now() });
    return originalJson(body);
  };

  // Deliberately NO res.on('close') handler releasing the key.
  //
  // `close` fires on client disconnect too -- a phone dropping signal
  // mid-checkout -- and it fires while the handler is STILL RUNNING. Deleting
  // a pending key there removes the one thing stopping the retry from placing
  // a second order and reserving stock twice, which is the exact scenario
  // this middleware exists for. There is no reliable way to tell "client hung
  // up, handler still working" from "handler died silently" at close time:
  // res.writableFinished is false for both.
  //
  // So a request that never answers holds its key until PENDING_TTL_MS. A
  // retry inside that window gets a 409 telling it the request is already in
  // flight, which is a far cheaper failure than a duplicate charge.

  return next();
}

module.exports = { idempotent };
