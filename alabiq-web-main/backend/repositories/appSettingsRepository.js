'use strict';

const database = require('../lib/database/pool');

async function getSetting(key) {
  try {
    const { rows } = await database.query(
      'SELECT value FROM public.app_settings WHERE key = $1', [key],
    );
    return { data: rows[0] || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

async function setSetting(key, value, actorId = null) {
  try {
    const { rows } = await database.query(
      `INSERT INTO public.app_settings(key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = EXCLUDED.updated_at,
         updated_by = EXCLUDED.updated_by
       RETURNING key, value, updated_at, updated_by`,
      [key, JSON.stringify(value), actorId],
    );
    return { data: rows[0], error: null };
  } catch (error) {
    return { data: null, error };
  }
}

module.exports = { getSetting, setSetting };
