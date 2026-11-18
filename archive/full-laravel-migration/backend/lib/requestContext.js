// ---------------------------------------------------------------------
// Per-request context, carried implicitly.
//
// The 395 console.error call sites log a message and an error and nothing
// else — they have no idea who was signed in or what path was being
// served. Threading `req` through every one of them would mean touching
// every controller and remembering to do it forever after.
//
// AsyncLocalStorage carries it instead: the middleware opens a store for
// the request and anything running inside it, however deep and across as
// many awaits as it likes, can ask for it. lib/errorLog.js is the only
// consumer today.
//
// Code with no request at all (the dispatch sweepers, boot-time setup)
// gets null from currentContext(). That is a normal case, not an error.
// ---------------------------------------------------------------------
const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();
const UA_MAX = 300;

function requestContext(req, res, next) {
  const ctx = {
    requestId: crypto.randomUUID(),
    method: req.method,
    // Query strings carry booking codes, search terms and the occasional
    // token; the path alone locates the handler.
    path: (req.originalUrl || req.url || '').split('?')[0],
    ip: req.ip || null,
    userAgent: (req.get('user-agent') || '').slice(0, UA_MAX) || null,
    userId: null,
    userEmail: null,
    userRole: null,
  };

  // Echoed so support can quote the id from a failed response and land on
  // the exact row in the admin Errors page.
  res.setHeader('X-Request-Id', ctx.requestId);

  storage.run(ctx, next);
}

function currentContext() {
  return storage.getStore() || null;
}

// Mutating the live store rather than re-running it keeps the middleware
// chain untouched.
function setContextUser({ id = null, email = null, role = null } = {}) {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.userId = id;
  ctx.userEmail = email;
  ctx.userRole = role;
}

module.exports = { requestContext, currentContext, setContextUser };
