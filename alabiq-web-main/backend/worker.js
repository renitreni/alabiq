/**
 * Background Job Worker
 *
 * Runs durable jobs with leases: dispatch, webhooks, GPS sampling.
 * Exactly one worker initially; scales with SKIP LOCKED leases.
 * All schedulers moved here from server.js.
 */
'use strict';

const { config } = require('./lib/config');
const database = require('./lib/database/pool');
const crypto = require('crypto');

// Job kinds
const JOB_KINDS = {
  DISPATCH: 'partner_dispatch',
  WEBHOOK: 'partner_webhook',
  GPS_SAMPLING: 'gps_sampling',
};

const WORKER_ID = `worker-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

let shuttingDown = false;
let leaseRenewalInterval = null;
let heartbeatInterval = null;

// --- Database helpers ------------------------------------------------------

async function query(sql, params = []) {
  const { rows } = await database.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// --- Lease management ------------------------------------------------------

async function claimJobs(kinds, limit) {
  const placeholders = kinds.map((_, i) => `$${i + 2}`).join(',');
  const rows = await query(
    `UPDATE public.background_jobs
     SET lease_owner=$1, lease_expires_at=now() + ($${kinds.length + 2} || ' seconds')::interval,
         attempts=attempts+1
     WHERE id IN (
       SELECT id FROM public.background_jobs
       WHERE kind IN (${placeholders})
         AND completed_at IS NULL
         AND run_at <= now()
         AND (lease_owner IS NULL OR lease_expires_at <= now())
       ORDER BY run_at
       FOR UPDATE SKIP LOCKED
       LIMIT $${kinds.length + 3}
     )
     RETURNING *`,
    [WORKER_ID, ...kinds, config.worker.jobLeaseSeconds, limit]
  );
  return rows;
}

async function completeJob(jobId) {
  await query(
    `UPDATE public.background_jobs SET completed_at=now(), lease_owner=NULL, lease_expires_at=NULL WHERE id=$1`,
    [jobId]
  );
}

async function failJob(jobId, error, maxAttempts) {
  await query(
    `UPDATE public.background_jobs
     SET last_error=$2, lease_owner=NULL, lease_expires_at=NULL,
         run_at=now() + (LEAST(POW(2, attempts) * 60, 3600) || ' seconds')::interval
     WHERE id=$1 AND attempts < $3`,
    [jobId, error, maxAttempts]
  );
}

async function releaseStaleLeases() {
  await query(
    `UPDATE public.background_jobs SET lease_owner=NULL, lease_expires_at=NULL
     WHERE lease_owner=$1 AND lease_expires_at < now() - ($2 || ' seconds')::interval`,
    [WORKER_ID, config.worker.jobLeaseSeconds * 2]
  );
}

async function renewLeases() {
  await query(
    `UPDATE public.background_jobs
     SET lease_expires_at=now() + ($1 || ' seconds')::interval
     WHERE lease_owner=$2 AND lease_expires_at > now() AND completed_at IS NULL`,
    [config.worker.jobLeaseSeconds, WORKER_ID]
  );
}

// --- Job Handlers ----------------------------------------------------------

async function handleDispatchJob(job) {
  const { orderId, source } = job.payload;
  if (source !== 'restaurant_partner') return;

  // Import dispatch functions
  const { startFoodDispatch } = require('./lib/dispatch');
  const { loadOrderSummary } = require('./repositories/dispatchRepository');

  try {
    const target = await loadOrderSummary('food', orderId);
    if (!target) {
      console.warn('[worker] Dispatch job: order not found', { orderId });
      return;
    }

    // Check if already has a delivery assigned
    const { rows } = await query(
      `SELECT id FROM public.deliveries WHERE order_id=$1 AND driver_id IS NOT NULL`,
      [orderId]
    );
    if (rows.length > 0) {
      console.log('[worker] Dispatch job: already assigned', { orderId });
      return;
    }

    // Start dispatch
    await startFoodDispatch(orderId);
    console.log('[worker] Dispatch started', { orderId });
  } catch (err) {
    console.error('[worker] Dispatch job error:', err);
    throw err;
  }
}

async function handleWebhookJob(job) {
  // Webhook deliveries are handled by the webhook delivery processor
  // This job type is for enqueueing new webhook events
  console.log('[worker] Webhook job (no-op, handled by processor)', { jobId: job.id });
}

async function handleGpsSamplingJob(job) {
  // Sample current Redis GPS fixes into PostgreSQL history
  const redis = require('redis').createClient({ url: process.env.REDIS_URL });
  await redis.connect().catch(() => {}); // optional

  try {
    // Get all active drivers with recent fixes
    const rows = await query(
      `SELECT driver_id, lat, lng, recorded_at, speed_kmh, heading
       FROM (
         SELECT dl.*, ROW_NUMBER() OVER (PARTITION BY dl.driver_id ORDER BY dl.recorded_at DESC) AS rn
         FROM public.driver_locations dl
         JOIN public.profiles p ON p.id=dl.driver_id
         WHERE dl.recorded_at >= now() - interval '2 minutes'
           AND p.role='driver' AND p.driver_approved=true
       ) latest WHERE rn=1`
    );

    // Batch insert into history (sampled, not every fix)
    if (rows.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;
      for (const r of rows) {
        values.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5})`);
        params.push(r.driver_id, r.lat, r.lng, r.recorded_at, r.speed_kmh || null, r.heading || null);
        idx += 6;
      }
      await query(
        `INSERT INTO public.driver_location_history(driver_id,lat,lng,recorded_at,speed_kmh,heading) VALUES ${values.join(',')}`,
        params
      );
    }
  } catch (err) {
    console.error('[worker] GPS sampling error:', err);
  } finally {
    await redis.quit().catch(() => {});
  }
}

// --- Main worker loop ------------------------------------------------------

async function processJobs() {
  if (shuttingDown) return;

  try {
    // Claim dispatch jobs
    const dispatchJobs = await claimJobs([JOB_KINDS.DISPATCH], config.worker.dispatchConcurrency);
    for (const job of dispatchJobs) {
      try {
        await handleDispatchJob(job);
        await completeJob(job.id);
      } catch (err) {
        await failJob(job.id, err.message, job.max_attempts);
      }
    }

    // Claim webhook jobs
    const webhookJobs = await claimJobs([JOB_KINDS.WEBHOOK], config.worker.webhookConcurrency);
    for (const job of webhookJobs) {
      try {
        await handleWebhookJob(job);
        await completeJob(job.id);
      } catch (err) {
        await failJob(job.id, err.message, job.max_attempts);
      }
    }

    // Claim GPS sampling jobs
    const gpsJobs = await claimJobs([JOB_KINDS.GPS_SAMPLING], config.worker.gpsSamplingConcurrency);
    for (const job of gpsJobs) {
      try {
        await handleGpsSamplingJob(job);
        await completeJob(job.id);
      } catch (err) {
        await failJob(job.id, err.message, job.max_attempts);
      }
    }
  } catch (err) {
    console.error('[worker] Process jobs error:', err);
  }
}

async function runWebhookProcessor() {
  if (shuttingDown) return;

  const { partnerRepository } = require('./repositories/partnerRepository');

  try {
    // Get pending webhook deliveries
    const deliveries = await partnerRepository.getPendingWebhookDeliveries(config.worker.webhookConcurrency * 2);
    for (const wd of deliveries) {
      try {
        // Send webhook
        const response = await fetch(wd.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Alabiq-Event-Id': wd.id,
            'X-Alabiq-Timestamp': Math.floor(Date.now() / 1000).toString(),
            'X-Alabiq-Signature': `v1=${require('crypto').createHmac('sha256', wd.secret_encrypted).update(`${Math.floor(Date.now() / 1000)}.${JSON.stringify(wd.payload)}`).digest('hex')}`,
            'X-Alabiq-Delivery-Id': wd.delivery_id,
          },
          body: JSON.stringify(wd.payload),
          signal: AbortSignal.timeout(config.partnerApi.webhookTimeoutMs),
        });

        if (response.ok) {
          await partnerRepository.updateWebhookDeliveryAttempt(wd.id, { attempt: wd.attempt + 1, status: response.status, completed: true });
        } else {
          await partnerRepository.updateWebhookDeliveryAttempt(wd.id, { attempt: wd.attempt + 1, status: response.status, error: `HTTP ${response.status}`, completed: false });
        }
      } catch (err) {
        await partnerRepository.updateWebhookDeliveryAttempt(wd.id, { attempt: wd.attempt + 1, error: err.message, completed: false });
      }
    }
  } catch (err) {
    console.error('[worker] Webhook processor error:', err);
  }
}

// --- Schedulers (moved from server.js) -------------------------------------

const { startDispatchSweeper } = require('./lib/dispatch');
const { sweepOrdersAwaitingPreparing } = require('./lib/foodPreparingReminder');
const { sweepStaleShopOrders } = require('./lib/dispatch');

let schedulersStarted = false;
function startSchedulers() {
  if (schedulersStarted) return;
  schedulersStarted = true;

  // Dispatch sweeper (offer expiry, abandon watchdog)
  startDispatchSweeper();

  // Food preparing reminder
  const { config: cfg } = require('./lib/config');
  setInterval(() => sweepOrdersAwaitingPreparing(), cfg.food.preparingReminderSweepMs);

  // Shop stale orders
  setInterval(() => sweepStaleShopOrders(), cfg.shop.staleSweepMs);

  console.log('[worker] Schedulers started');
}

// --- Lifecycle -------------------------------------------------------------

async function start() {
  console.log(`[worker] Starting ${WORKER_ID}`);

  // Start lease renewal
  leaseRenewalInterval = setInterval(() => renewLeases(), config.worker.heartbeatIntervalMs);

  // Start heartbeat
  heartbeatInterval = setInterval(() => {
    console.log(`[worker] Heartbeat: ${WORKER_ID}`);
  }, config.worker.heartbeatIntervalMs * 6);

  // Start schedulers
  startSchedulers();

  // Main job processing loop
  setInterval(() => processJobs(), 1000);

  // Webhook processor loop
  setInterval(() => runWebhookProcessor(), 5000);

  console.log('[worker] Started');
}

async function shutdown(signal) {
  console.log(`[worker] Shutdown signal received: ${signal}`);
  shuttingDown = true;

  // Stop intervals
  if (leaseRenewalInterval) clearInterval(leaseRenewalInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  // Release leases
  await releaseStaleLeases();

  // Close database pool
  await database.end();

  console.log('[worker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start if run directly
if (require.main === module) {
  start().catch((err) => {
    console.error('[worker] Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = { start, shutdown, WORKER_ID };
