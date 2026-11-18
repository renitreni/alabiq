'use strict';

const database = require('../lib/database/pool');

async function replace({ driverId, document }) {
  return database.transaction(async (client) => {
    await client.query('DELETE FROM public.driver_documents WHERE driver_id=$1 AND doc_type=$2',
      [driverId, document.doc_type]);
    const result = await client.query(
      `INSERT INTO public.driver_documents
         (driver_id,doc_type,storage_path,file_name,mime_type,file_size_bytes,file_hash,expiry_date,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING id,doc_type,status,created_at`,
      [driverId, document.doc_type, document.path, document.file_name ?? null,
        document.mime_type ?? null, document.size_bytes ?? null, document.file_hash ?? null,
        document.expiry_date ?? null],
    );
    await client.query(
      `UPDATE public.profiles SET driver_verification_status='submitted' WHERE id=$1`, [driverId],
    );
    return result.rows[0];
  });
}

async function listForDriver(driverId) {
  const result = await database.query(
    `SELECT id,doc_type,status,rejection_reason,file_name,expiry_date,reviewed_at,created_at
       FROM public.driver_documents WHERE driver_id=$1 ORDER BY created_at DESC`, [driverId],
  );
  return result.rows;
}

async function profileStatus(driverId) {
  const result = await database.query(
    'SELECT driver_approved,driver_verification_status FROM public.profiles WHERE id=$1', [driverId],
  );
  return result.rows[0] || null;
}

module.exports = { replace, listForDriver, profileStatus };
