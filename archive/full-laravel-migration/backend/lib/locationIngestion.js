/**
 * Redis GPS Hot Path
 *
 * High-throughput rider location ingestion with validation, TTL, and PostgreSQL fallback.
 * Replaces process-local GPS throttling; all schedulers worker-owned.
 */
'use strict';

const { config } = require('./config');
const database = require('./database/pool');

// --- Ingestion backpressure --------------------------------------------------
// Bounded concurrent ingestions so rider ping bursts can't exhaust the PG pool/Redis.
const MAX_CONCURRENT_INGESTIONS = toNumber(process.env.LOCATION_INGESTION_MAX_CONCURRENT, 200);
let activeIngestions = 0;
const waitingIngestions = [];

function toNumber(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

async function withIngestionSlot(fn) {
  if (activeIngestions < MAX_CONCURRENT_INGESTIONS) {
    activeIngestions++;
    try {
      return await fn();
    } finally {
      activeIngestions--;
      // Process next waiting ingestion if any
      if (waitingIngestions.length > 0) {
        const next = waitingIngestions.shift();
        next.resolve(withIngestionSlot(next.fn));
      }
    }
  }

  // Queue is full - reject with backpressure
  return new Promise((resolve, reject) => {
    if (waitingIngestions.length >= MAX_CONCURRENT_INGESTIONS) {
      reject({ backpressure: true, message: 'Ingestion queue full' });
      return;
    }
    waitingIngestions.push({
      fn,
      resolve: (v) => resolve(v),
      reject,
    });
  });
}

let redisClient = null;
let redisAvailable = false;

// Initialize Redis connection (lazy, optional)
async function getRedis() {
  if (redisClient) return redisClient;
  if (!process.env.REDIS_URL) return null;

  try {
    const { createClient } = require('redis');
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => {
      console.warn('[locationIngestion] Redis error:', err.message);
      redisAvailable = false;
    });
    await redisClient.connect();
    redisAvailable = true;
    console.log('[locationIngestion] Redis connected');
  } catch (err) {
    console.warn('[locationIngestion] Redis unavailable, using PostgreSQL fallback:', err.message);
    redisAvailable = false;
  }
  return redisClient;
}

// --- Validation ------------------------------------------------------------

function validateLocationPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  // Required fields
  if (typeof payload.lat !== 'number' || !Number.isFinite(payload.lat) || payload.lat < -90 || payload.lat > 90) {
    errors.push('Invalid latitude');
  }
  if (typeof payload.lng !== 'number' || !Number.isFinite(payload.lng) || payload.lng < -180 || payload.lng > 180) {
    errors.push('Invalid longitude');
  }
  if (typeof payload.recorded_at !== 'number' || !Number.isFinite(payload.recorded_at) || payload.recorded_at <= 0) {
    errors.push('Invalid recorded_at timestamp');
  }

  // Optional fields with validation
  if (payload.accuracy !== undefined) {
    if (typeof payload.accuracy !== 'number' || !Number.isFinite(payload.accuracy) || payload.accuracy < 0) {
      errors.push('Invalid accuracy');
    }
  }
  if (payload.speed_kmh !== undefined) {
    if (typeof payload.speed_kmh !== 'number' || !Number.isFinite(payload.speed_kmh) || payload.speed_kmh < 0) {
      errors.push('Invalid speed_kmh');
    }
  }
  if (payload.heading !== undefined) {
    if (typeof payload.heading !== 'number' || !Number.isFinite(payload.heading) || payload.heading < 0 || payload.heading > 360) {
      errors.push('Invalid heading');
    }
  }

  // Timestamp validation: not too far in future, not too old
  const now = Date.now();
  const recordedAt = payload.recorded_at;
  const maxFutureMs = 5 * 60 * 1000; // 5 minutes future tolerance
  const maxAgeMs = config.locationRedis.ttlSeconds * 1000 * 2; // 2x TTL

  if (recordedAt > now + maxFutureMs) {
    errors.push('Timestamp too far in future');
  }
  if (now - recordedAt > maxAgeMs) {
    errors.push('Fix too old');
  }

  return { valid: errors.length === 0, errors };
}

function isDispatchReady(accuracy) {
  if (accuracy === undefined || accuracy === null) return false;
  return accuracy <= config.locationRedis.accuracyThresholdMeters;
}

function isPlausibleJump(lastFix, newFix) {
  if (!lastFix || !lastFix.lat || !lastFix.lng || !lastFix.recorded_at) return true; // no history = plausible

  const { haversineKm } = require('./geo');
  const distanceKm = haversineKm(
    { lat: lastFix.lat, lng: lastFix.lng },
    { lat: newFix.lat, lng: newFix.lng }
  );
  const elapsedHours = (newFix.recorded_at - lastFix.recorded_at) / (1000 * 60 * 60);

  if (elapsedHours <= 0) return distanceKm < 0.1; // same timestamp, very close

  const speedKmh = distanceKm / elapsedHours;
  return speedKmh <= config.locationRedis.maxPlausibleSpeedKmh;
}

// --- Redis Operations ------------------------------------------------------

async function updateCurrentLocation(driverId, fix) {
  const redis = await getRedis();
  if (!redis || !redisAvailable) return updateCurrentLocationPg(driverId, fix);

  const key = `rider:location:${driverId}`;
  const geoKey = 'riders:available:geo';
  const ttl = config.locationRedis.ttlSeconds;

  const fixData = {
    lat: fix.lat,
    lng: fix.lng,
    recorded_at: fix.recorded_at,
    accuracy: fix.accuracy || null,
    speed_kmh: fix.speed_kmh || null,
    heading: fix.heading || null,
  };

  // Use Lua script for atomic current + GEO update
  const luaScript = `
    local currentKey = KEYS[1]
    local geoKey = KEYS[2]
    local driverId = ARGV[1]
    local lat = tonumber(ARGV[2])
    local lng = tonumber(ARGV[3])
    local recordedAt = tonumber(ARGV[4])
    local ttl = tonumber(ARGV[5])
    local accuracy = ARGV[6]
    local speed = ARGV[7]
    local heading = ARGV[8]

    -- Get existing fix timestamp
    local existing = redis.call('GET', currentKey)
    if existing then
      local existingData = cjson.decode(existing)
      if existingData.recorded_at and recordedAt <= existingData.recorded_at then
        return {err='stale_fix'}
      end
    end

    -- Update current location
    local fixData = {lat=lat, lng=lng, recorded_at=recordedAt, accuracy=accuracy, speed=speed, heading=heading}
    redis.call('SET', currentKey, cjson.encode(fixData), 'EX', ttl)

    -- Update GEO index for available riders (only if accuracy is good enough)
    local accuracyNum = tonumber(accuracy) or 9999
    if accuracyNum <= 100 then
      redis.call('GEOADD', geoKey, lng, lat, driverId)
    else
      redis.call('ZREM', geoKey, driverId)
    end

    return {ok='updated'}
  `;

  try {
    const result = await redis.eval(luaScript, {
      keys: [key, geoKey],
      arguments: [
        driverId,
        fix.lat.toString(),
        fix.lng.toString(),
        fix.recorded_at.toString(),
        ttl.toString(),
        (fix.accuracy || 9999).toString(),
        (fix.speed_kmh || 0).toString(),
        (fix.heading || 0).toString(),
      ],
    });
    return result.ok === 'updated';
  } catch (err) {
    if (err.message?.includes('stale_fix')) return false;
    console.warn('[locationIngestion] Redis update failed, falling back to PG:', err.message);
    redisAvailable = false;
    return updateCurrentLocationPg(driverId, fix);
  }
}

async function updateCurrentLocationPg(driverId, fix) {
  await database.query(
    `INSERT INTO public.driver_locations(driver_id,lat,lng,recorded_at,accuracy,speed_kmh,heading)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [driverId, fix.lat, fix.lng, new Date(fix.recorded_at), fix.accuracy || null, fix.speed_kmh || null, fix.heading || null]
  );
  return true;
}

async function getCurrentLocation(driverId) {
  const redis = await getRedis();
  if (!redis || !redisAvailable) {
    const { rows } = await database.query(
      `SELECT lat,lng,recorded_at,accuracy,speed_kmh,heading FROM public.driver_locations WHERE driver_id=$1 ORDER BY recorded_at DESC LIMIT 1`,
      [driverId]
    );
    return rows[0] || null;
  }

  const key = `rider:location:${driverId}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function getNearbyRiders(lat, lng, radiusKm, limit = 50) {
  const redis = await getRedis();
  if (!redis || !redisAvailable) {
    return getNearbyRidersPg(lat, lng, radiusKm, limit);
  }

  try {
    const results = await redis.geosearch('riders:available:geo', {
      latitude: lat,
      longitude: lng,
      radius: radiusKm * 1000, // meters
      count: limit,
      withCoord: true,
      withDist: true,
    });
    return results.map(r => ({
      driver_id: r.member,
      lat: r.coordinates.latitude,
      lng: r.coordinates.longitude,
      distance_m: r.distance,
    }));
  } catch (err) {
    console.warn('[locationIngestion] Redis geosearch failed, falling back to PG:', err.message);
    redisAvailable = false;
    return getNearbyRidersPg(lat, lng, radiusKm, limit);
  }
}

async function getNearbyRidersPg(lat, lng, radiusKm, limit) {
  const { rows } = await database.query(
    `SELECT dl.driver_id, dl.lat, dl.lng, dl.recorded_at,
       (6371 * acos(cos(radians($1)) * cos(radians(dl.lat)) * cos(radians(dl.lng) - radians($2)) + sin(radians($1)) * sin(radians(dl.lat)))) AS distance_km
     FROM public.driver_locations dl
     JOIN public.profiles p ON p.id=dl.driver_id
     WHERE dl.recorded_at >= now() - interval '2 minutes'
       AND p.role='driver' AND p.driver_approved=true
     ORDER BY distance_km
     LIMIT $3`,
    [lat, lng, limit]
  );
  return rows.map(r => ({ driver_id: r.driver_id, lat: r.lat, lng: r.lng, distance_m: Math.round(r.distance_km * 1000) }));
}

async function removeDriverFromGeo(driverId) {
  const redis = await getRedis();
  if (redis && redisAvailable) {
    try {
      await redis.zrem('riders:available:geo', driverId);
      await redis.del(`rider:location:${driverId}`);
    } catch (err) {
      console.warn('[locationIngestion] Redis remove failed:', err.message);
    }
  }
  // Also clean up PG (optional, TTL handles it)
}

// --- Sampling --------------------------------------------------------------

async function sampleLocationHistory() {
  // Sample current Redis fixes into PostgreSQL history
  // This runs periodically from the worker
  const redis = await getRedis();
  if (!redis || !redisAvailable) return;

  try {
    // Get all keys matching rider:location:*
    const keys = await redis.keys('rider:location:*');
    if (keys.length === 0) return;

    // Batch get all fixes
    const fixes = await redis.mGet(keys);
    const values = [];
    const params = [];
    let idx = 1;

    for (let i = 0; i < fixes.length; i++) {
      if (!fixes[i]) continue;
      const fix = JSON.parse(fixes[i]);
      const driverId = keys[i].replace('rider:location:', '');
      values.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6})`);
      params.push(driverId, fix.lat, fix.lng, new Date(fix.recorded_at), fix.accuracy || null, fix.speed_kmh || null, fix.heading || null);
      idx += 7;
    }

    if (values.length > 0) {
      await database.query(
        `INSERT INTO public.driver_location_history(driver_id,lat,lng,recorded_at,accuracy,speed_kmh,heading) VALUES ${values.join(',')}`,
        params
      );
    }
  } catch (err) {
    console.error('[locationIngestion] Sampling error:', err);
  }
}

// --- Public API ------------------------------------------------------------

async function ingestLocation(driverId, payload) {
  // Backpressure: bound concurrent ingestions
  return withIngestionSlot(async () => {
    // Validate
    const validation = validateLocationPayload(payload);
    if (!validation.valid) {
      return { accepted: false, errors: validation.errors };
    }

    // Check for stale fix (client-side timestamp)
    const lastFix = await getCurrentLocation(driverId);
    if (lastFix && payload.recorded_at <= lastFix.recorded_at) {
      return { accepted: false, errors: ['Stale fix: timestamp not newer than last accepted'] };
    }

    // Check for implausible jump
    if (lastFix && !isPlausibleJump(lastFix, payload)) {
      return { accepted: false, errors: ['Implausible jump: speed exceeds maximum plausible'] };
    }

    // Check dispatch readiness
    const dispatchReady = isDispatchReady(payload.accuracy);

    // Update Redis + GEO
    await updateCurrentLocation(driverId, payload);

    return {
      accepted: true,
      dispatch_ready: dispatchReady,
      server_time: Date.now(),
      next_ping_interval_ms: config.locationRedis.samplingIntervalSeconds * 1000,
    };
  }).catch((err) => {
    if (err?.backpressure) {
      return { accepted: false, errors: ['Ingestion backpressure: too many concurrent requests'] };
    }
    throw err;
  });
}

async function getDriverLocationForTracking(driverId) {
  // Used by public tracking - returns latest fix if fresh
  const fix = await getCurrentLocation(driverId);
  if (!fix) return null;

  const ageMs = Date.now() - fix.recorded_at;
  const maxAgeMs = config.dispatch.driverFreshMinutes * 60 * 1000;

  if (ageMs > maxAgeMs) return null;

  return {
    lat: fix.lat,
    lng: fix.lng,
    at: new Date(fix.recorded_at).toISOString(),
    heading: fix.heading,
    speed_kmh: fix.speed_kmh,
  };
}

module.exports = {
  ingestLocation,
  getCurrentLocation,
  getNearbyRiders,
  removeDriverFromGeo,
  sampleLocationHistory,
  getDriverLocationForTracking,
  validateLocationPayload,
  isDispatchReady,
  isPlausibleJump,
};
