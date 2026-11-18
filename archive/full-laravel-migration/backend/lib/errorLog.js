// ---------------------------------------------------------------------
// Backend errors, persisted to error_logs (migration 0042) so the admin
// portal can read them instead of someone SSH-ing in to grep pm2 logs.
//
// The capture is implicit on purpose. There are 395 console.error call
// sites; rewriting each one would be 395 chances to get it wrong now and
// one more thing to remember on every future catch block.
// installConsoleCapture() wraps console.error once at boot and they all
// start producing rows with no edit. The original console.error still
// runs first, so the pm2 log is unchanged.
//
// Best-effort like lib/audit.js: a logging failure is printed and
// swallowed. Turning a handled 500 into a crash because the logger broke
// is not acceptable.
//
// Errors from Supabase and Tap routinely echo the credential that was
// rejected, so redact() runs over every message and stack before insert.
// ---------------------------------------------------------------------
const crypto = require('node:crypto');
const database = require('./database/pool');
const { currentContext } = require('./requestContext');

// Kept from before the wrap so the logger's own failures don't re-enter it.
const rawConsoleError = console.error.bind(console);

const MESSAGE_MAX = 1000;
const STACK_MAX = 4000;
const LABEL_MAX = 120;

// One row per distinct error per minute, and never more than 120 rows a
// minute overall. A bug in a hot path fires hundreds of times a second, and
// a page showing the same row ten thousand times is no more useful than the
// pm2 log it replaced. Storage is not the reason — we are on Supabase Pro.
const DEDUPE_WINDOW_MS = 60_000;
const MAX_WRITES_PER_MIN = 120;
const MAX_TRACKED_FINGERPRINTS = 500;

// In-memory is correct here: one long-running PM2 process, single instance.
const seen = new Map();

let writeWindowStart = 0;
let writesThisWindow = 0;
let capturing = false;
let installed = false;

// Deliberately greedy. A false positive costs a few unreadable characters
// in a stack; a false negative writes a live key into a table that
// outlives the incident.
const REDACTIONS = [
  [/\b(sk|pk)_(test|live)?_?[A-Za-z0-9]{8,}/g, '$1_[redacted]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[redacted-jwt]'],
  [
    /(["']?(?:password|passwd|secret|token|api[_-]?key|apikey|authorization|service[_-]?role[_-]?key)["']?\s*[:=]\s*)(["']?)[^\s,;"'}]+/gi,
    '$1$2[redacted]',
  ],
];

function redact(text) {
  if (!text) return text;
  let out = String(text);
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

function stringifyArg(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || value.name || 'Error';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value); // circular, or a getter that throws
  }
}

// Four call shapes exist in this codebase and all four land here:
//   console.error('cancelBooking error:', err)                    the ~90% case
//   console.error('location search error:', err.message || err)   string, no Error
//   console.error('recordChargeStart threw', { code, err })       object
//   handleError(res, err, what) in merchantHoursController        template string
function parseArgs(args) {
  const first = typeof args[0] === 'string' ? args[0] : '';
  const label =
    first
      .replace(/[\s:]+$/, '')
      .replace(/\s+(error|failed|threw)$/i, '')
      .slice(0, LABEL_MAX) || 'unlabelled';

  const err = args.find((a) => a instanceof Error);
  const rest = args.slice(first ? 1 : 0).filter((a) => a !== err);

  let message;
  if (err) {
    message = err.message || String(err);
  } else {
    message = rest.map(stringifyArg).filter(Boolean).join(' ');
  }
  if (!message) message = first || 'No message';

  return {
    label,
    message: redact(message).slice(0, MESSAGE_MAX),
    errorName: err ? err.name : null,
    stack: err && err.stack ? redact(err.stack).slice(0, STACK_MAX) : null,
  };
}

// Booking codes, uuids and counts differ on every occurrence and must not
// split one bug into a thousand groups.
function fingerprintOf(label, message) {
  const normalised = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b[A-Z]{2,}-\d+\b/g, '<code>')
    .replace(/\d+/g, '<n>')
    .replace(/["'][^"']*["']/g, '<str>')
    .toLowerCase();
  return crypto.createHash('sha1').update(`${label}|${normalised}`).digest('hex');
}

// Returns the suppressed count to attach, or null to count this
// occurrence instead of writing it.
function claimWriteSlot(fingerprint) {
  const now = Date.now();

  if (now - writeWindowStart >= 60_000) {
    writeWindowStart = now;
    writesThisWindow = 0;
  }
  if (writesThisWindow >= MAX_WRITES_PER_MIN) return null;

  const entry = seen.get(fingerprint);
  if (entry && now - entry.lastWriteAt < DEDUPE_WINDOW_MS) {
    entry.suppressed += 1;
    return null;
  }

  // Map preserves insertion order, so the first key is the oldest — good
  // enough eviction for a noise filter, and it stops the dedupe map
  // becoming the leak it exists to prevent.
  if (!entry && seen.size >= MAX_TRACKED_FINGERPRINTS) {
    seen.delete(seen.keys().next().value);
  }

  const suppressed = entry ? entry.suppressed : 0;
  seen.set(fingerprint, { lastWriteAt: now, suppressed: 0 });
  writesThisWindow += 1;
  return suppressed;
}

// Exported so new code can log with fields the console never carries.
async function logError({
  label,
  message,
  errorName = null,
  stack = null,
  severity = 'error',
  statusCode = null,
  context = null,
}) {
  try {
    const cleanLabel = String(label || 'unlabelled').slice(0, LABEL_MAX);
    const cleanMessage = redact(String(message || 'No message')).slice(0, MESSAGE_MAX);
    const fingerprint = fingerprintOf(cleanLabel, cleanMessage);

    const suppressed = claimWriteSlot(fingerprint);
    if (suppressed === null) return;

    const ctx = context || currentContext();

    await database.query(`INSERT INTO public.error_logs
      (severity,label,message,error_name,stack,request_id,method,path,status_code,ip,user_agent,user_id,user_email,user_role,fingerprint,suppressed_count)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [
      severity, cleanLabel, cleanMessage, errorName,
      stack ? redact(stack).slice(0, STACK_MAX) : null,
      ctx ? ctx.requestId : null, ctx ? ctx.method : null,
      ctx ? ctx.path : null, statusCode, ctx ? ctx.ip : null,
      ctx ? ctx.userAgent : null, ctx ? ctx.userId : null,
      ctx ? ctx.userEmail : null, ctx ? ctx.userRole : null,
      fingerprint, suppressed,
    ]);
  } catch (err) {
    rawConsoleError('logError threw:', (err && err.message) || err);
  }
}

function installConsoleCapture() {
  if (installed) return;
  installed = true;

  const original = console.error;

  console.error = function capturedConsoleError(...args) {
    original.apply(console, args);

    if (capturing) return;
    capturing = true;
    try {
      void logError(parseArgs(args));
    } catch (err) {
      rawConsoleError('console capture failed:', (err && err.message) || err);
    } finally {
      capturing = false;
    }
  };
}

// Printing through the pre-wrap console.error is what stops the
// interception writing a second, poorer row for the same event.
function reportFatal(label, err, { statusCode = null } = {}) {
  const error = err instanceof Error ? err : new Error(String(err));
  rawConsoleError(`${label}:`, error);
  void logError({
    label,
    message: error.message,
    errorName: error.name,
    stack: error.stack,
    severity: 'fatal',
    statusCode,
  });
}

// A crash or an unhandled rejection is the most valuable thing to have a
// record of, and the least likely to still be in the pm2 log by the time
// anyone looks.
function installProcessHandlers() {
  process.on('unhandledRejection', (reason) => reportFatal('unhandledRejection', reason));
  process.on('uncaughtException', (err) => {
    reportFatal('uncaughtException', err);
    // Not exiting: PM2 would restart us anyway and this process has a
    // better chance of flushing the row first.
  });
}

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// audit_logs is deliberately never pruned; this table is the opposite —
// fastest-growing during an incident, and a month-old handled error helps
// nobody. Interval rather than a cron on the box, same as the dispatch
// sweeper.
function startErrorLogPruner(keepDays = 30) {
  const run = async () => {
    try {
      const { rowCount } = await database.query(
        `DELETE FROM public.error_logs WHERE occurred_at < now() - make_interval(days => $1)`, [keepDays],
      );
      if (rowCount) console.log(`[error_logs] pruned ${rowCount} row(s) older than ${keepDays} days`);
    } catch (err) {
      rawConsoleError('prune_error_logs threw:', (err && err.message) || err);
    }
  };

  const timer = setInterval(run, PRUNE_INTERVAL_MS);
  timer.unref?.();
  void run();
  return timer;
}

module.exports = {
  logError,
  reportFatal,
  installConsoleCapture,
  installProcessHandlers,
  startErrorLogPruner,
};
