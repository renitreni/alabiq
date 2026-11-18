'use strict';

const database = require('../lib/database/pool');

async function bookingStats() {
  const result=await database.query(`SELECT booking_status,payment_status,count(*)::int AS count,
      coalesce(sum(fare_amount) FILTER (WHERE payment_status='verified'),0)::numeric(14,2) AS revenue,
      count(*) FILTER (WHERE created_at >= date_trunc('day',now()))::int AS today_count
    FROM public.bookings GROUP BY booking_status,payment_status`);
  return result.rows;
}
async function reportBookings(from) {
  const result=await database.query(`SELECT booking_code,created_at,booking_status,payment_status,fare_amount,
      currency,trip_type,passenger_name FROM public.bookings WHERE created_at >= $1 ORDER BY created_at ASC`,[from]);
  return result.rows;
}
async function listDrivers({limit, offset, search, sortBy, sortOrder, filters}) {
  const values = []; const clauses = [`role = 'driver'`];
  
  // Handle filters object
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      values.push(value);
      clauses.push(`${key} = $${values.length}`);
    });
  }
  
  // Handle search
  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(full_name ILIKE $${values.length} OR email ILIKE $${values.length} OR whatsapp_number ILIKE $${values.length} OR mobile_number ILIKE $${values.length})`);
  }
  
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const count = await database.query(`SELECT count(*)::int AS total FROM public.profiles ${where}`, values.slice());
  
  // Validate sort column
  const allowedSortColumns = ['id', 'full_name', 'email', 'whatsapp_number', 'mobile_number', 'national_id', 'vehicle_type', 'vehicle_plate', 'driver_approved', 'created_at'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  values.push(limit, offset);
  const result = await database.query(`SELECT id,full_name,email,whatsapp_number,mobile_number,national_id,
      vehicle_type,vehicle_plate,driver_approved,driver_verification_status,created_at FROM public.profiles
    ${where} ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT $${values.length-1} OFFSET $${values.length}`, values);
  
  return { rows: result.rows, total: count.rows[0].total };
}
async function driverStats() {
  const result=await database.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE driver_approved)::int AS approved
    FROM public.profiles WHERE role='driver'`);
  return result.rows[0] || {total:0,approved:0};
}
async function setDriverApproval(id,approved) {
  const result=await database.query(`UPDATE public.profiles SET driver_approved=$1 WHERE id=$2 AND role='driver'
    RETURNING id,full_name,driver_approved`,[approved,id]);
  return result.rows[0] || null;
}
async function listDriverCash() {
  const result=await database.query(`SELECT id,full_name,whatsapp_number,mobile_number,cash_owed,cash_owed_limit
    FROM public.profiles WHERE role='driver' ORDER BY cash_owed DESC`);
  return result.rows;
}
async function driverIdentity(id) {
  const result=await database.query(`SELECT id,role FROM public.profiles WHERE id=$1`,[id]);
  return result.rows[0] || null;
}
async function cashProfile(id) {
  const result=await database.query('SELECT cash_owed,cash_owed_limit FROM public.profiles WHERE id=$1',[id]);
  return result.rows[0] || null;
}
async function bookingByCode(code) {
  const result=await database.query(`SELECT id,booking_code,fare_amount,vat_amount,vat_rate,total_amount,currency,
      payment_status,payment_method,booking_status,assigned_driver_id FROM public.bookings WHERE booking_code=$1`,[code]);
  return result.rows[0] || null;
}
async function latestProofId(bookingId) {
  const result=await database.query(`SELECT id FROM public.payment_proofs WHERE booking_id=$1
      ORDER BY created_at DESC LIMIT 1`,[bookingId]);
  return result.rows[0]?.id || null;
}
async function listBookings({limit,offset,bookingStatus,paymentStatus,search,sortBy,sortOrder,filters}) {
  const values=[]; const clauses=[];
  if (bookingStatus) { values.push(bookingStatus); clauses.push(`booking_status=$${values.length}`); }
  if (paymentStatus) { values.push(paymentStatus); clauses.push(`payment_status=$${values.length}`); }
  
  // Handle filters object
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) return;
      if (['bookingStatus', 'paymentStatus'].includes(key)) return; // Already handled
      values.push(value);
      clauses.push(`${key} = $${values.length}`);
    });
  }
  
  // Handle search
  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(booking_code ILIKE $${values.length} OR passenger_name ILIKE $${values.length} OR passenger_whatsapp ILIKE $${values.length})`);
  }
  
  const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
  const count=await database.query(`SELECT count(*)::int AS total FROM public.bookings ${where}`,values.slice());
  values.push(limit,offset);
  
  // Validate sort column
  const allowedSortColumns = ['booking_code', 'passenger_name', 'trip_type', 'pickup_datetime', 'fare_amount', 'currency', 'payment_method', 'payment_status', 'booking_status', 'driver_ride_status', 'created_at'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  const result=await database.query(`SELECT booking_code,passenger_name,passenger_whatsapp,trip_type,pickup_datetime,
      fare_amount,currency,payment_method,payment_status,booking_status,driver_ride_status,assigned_driver_id,created_at
    FROM public.bookings ${where} ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT $${values.length-1} OFFSET $${values.length}`,values);
  return {rows:result.rows,total:count.rows[0].total};
}
async function bookingDetail(code) {
  const result=await database.query('SELECT * FROM public.bookings WHERE booking_code=$1',[code]);
  return result.rows[0] || null;
}
async function proofs(bookingId) {
  const result=await database.query(`SELECT id,file_url,file_name,file_mime_type,file_size_bytes,status,rejection_reason,
      reviewed_at,created_at FROM public.payment_proofs WHERE booking_id=$1 ORDER BY created_at DESC`,[bookingId]);
  return result.rows;
}
async function payments(bookingId) {
  const result=await database.query(`SELECT id,provider,amount,currency,status,manual_reference,verified_by_system,
      verification_mode,verified_at,created_at FROM public.payments WHERE booking_id=$1 ORDER BY created_at DESC`,[bookingId]);
  return result.rows;
}
async function driverContact(id) {
  const result=await database.query('SELECT id,full_name,mobile_number,whatsapp_number FROM public.profiles WHERE id=$1',[id]);
  return result.rows[0] || null;
}
async function driverAssignedAt(bookingId) {
  const result=await database.query(`SELECT created_at FROM public.tracking_events
    WHERE booking_id=$1 AND event_type='driver_assigned' ORDER BY created_at DESC LIMIT 1`,[bookingId]);
  return result.rows[0]?.created_at || null;
}
async function driverForAssignment(id) {
  const result=await database.query('SELECT id,full_name,role FROM public.profiles WHERE id=$1',[id]);
  return result.rows[0] || null;
}
async function assignDriver(bookingId,driverId) {
  const result=await database.query(`UPDATE public.bookings SET assigned_driver_id=$1,driver_ride_status='accepted',
      booking_status='driver_assigned' WHERE id=$2 RETURNING booking_code,booking_status,driver_ride_status`,[driverId,bookingId]);
  return result.rows[0] || null;
}
async function driverDocumentSummary(id) {
  const result=await database.query(`SELECT id,full_name,email,whatsapp_number,driver_approved,driver_verification_status
    FROM public.profiles WHERE id=$1 AND role='driver'`,[id]);
  return result.rows[0] || null;
}
async function driverDocuments(id) {
  const result=await database.query(`SELECT id,doc_type,status,rejection_reason,file_name,mime_type,expiry_date,
      storage_path,reviewed_at,created_at FROM public.driver_documents WHERE driver_id=$1 ORDER BY created_at DESC`,[id]);
  return result.rows;
}
async function reviewDriverDocument({driverId,docId,status,reason,adminId,requiredTypes,at=new Date()}) {
  return database.transaction(async(client)=>{
    const updated=await client.query(`UPDATE public.driver_documents SET status=$1,rejection_reason=$2,
        reviewed_by_admin_id=$3,reviewed_at=$4 WHERE id=$5 AND driver_id=$6 RETURNING id,doc_type,status`,
      [status,reason,adminId,at,docId,driverId]);
    if(!updated.rowCount) return null;
    const docs=await client.query('SELECT doc_type,status FROM public.driver_documents WHERE driver_id=$1',[driverId]);
    const verified=new Set(docs.rows.filter((row)=>row.status==='verified').map((row)=>row.doc_type));
    const allRequiredVerified=requiredTypes.every((type)=>verified.has(type));
    const driverApproved=status!=='rejected'&&allRequiredVerified;
    const verificationStatus=status==='rejected'?'rejected':driverApproved?'approved':'submitted';
    await client.query(`UPDATE public.profiles SET driver_verification_status=$1,driver_approved=$2 WHERE id=$3`,
      [verificationStatus,driverApproved,driverId]);
    return {...updated.rows[0],driverApproved,verificationStatus,allRequiredVerified};
  });
}

module.exports={bookingStats,reportBookings,listDrivers,driverStats,setDriverApproval,listDriverCash,driverIdentity,cashProfile,
  bookingByCode,latestProofId,listBookings,bookingDetail,proofs,payments,driverContact,driverAssignedAt,
  driverForAssignment,assignDriver,driverDocumentSummary,driverDocuments,reviewDriverDocument};
