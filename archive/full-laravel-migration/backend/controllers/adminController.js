// ---------------------------------------------------------------------
// Admin controller (all routes gated by requireAdmin)
//   - listBookings    : GET  /api/admin/bookings
//   - getBookingDetail: GET  /api/admin/bookings/:bookingCode
//   - verifyPayment   : POST /api/admin/bookings/:bookingCode/verify-payment
//   - rejectPayment   : POST /api/admin/bookings/:bookingCode/reject-payment
//   - assignDriver    : POST /api/admin/bookings/:bookingCode/assign-driver
//
// Verify/reject reuse lib/payments.js so manual review and test auto-verify
// share one state machine. The admin's profile id is optional (interim
// shared-secret auth has no user context) and passed via x-admin-id.
// ---------------------------------------------------------------------
const adminRepository = require('../repositories/adminRepository');
const { addTrackingEvent } = require('../lib/tracking');
const { verifyBookingPayment, rejectBookingPayment } = require('../lib/payments');
const { createProofDownloadUrl, createDriverDocDownloadUrl } = require('../lib/storage');
const { pushBookingStatus, announceRequestTaken } = require('../lib/realtime');
const { driverCashView, settleDriverCash: settleDriverCashBalance } = require('../lib/driverCash');
const { config } = require('../lib/config');

function adminId(req) {
  return req.adminId || null;
}

// --- GET /api/admin/stats --------------------------------------------
// Dashboard overview: totals, revenue, status breakdowns, driver counts.
// For the MVP we read slim columns and aggregate in JS; swap to SQL
// aggregates if the bookings table ever gets large.
const ACTIVE_BOOKING = ['driver_assigned', 'driver_on_the_way', 'arrived', 'in_progress'];

async function getStats(req, res) {
  try {
    const [bookings, driverSummary] = await Promise.all([
      adminRepository.bookingStats(), adminRepository.driverStats(),
    ]);

    const bookingsByStatus = {};
    const paymentsByStatus = {};
    let totalBookings=0,revenue=0,completed=0,cancelled=0,active=0,today=0;
    for(const row of bookings){
      const count=Number(row.count); totalBookings+=count; revenue+=Number(row.revenue)||0; today+=Number(row.today_count)||0;
      bookingsByStatus[row.booking_status]=(bookingsByStatus[row.booking_status]||0)+count;
      paymentsByStatus[row.payment_status]=(paymentsByStatus[row.payment_status]||0)+count;
      if(row.booking_status==='completed') completed+=count;
      if(row.booking_status==='cancelled') cancelled+=count;
      if(ACTIVE_BOOKING.includes(row.booking_status)) active+=count;
    }

    return res.json({
      totals: {
        bookings: totalBookings,
        completed,
        cancelled,
        active,
        today,
        revenue: Math.round(revenue * 100) / 100,
        currency: 'SAR',
        needsReview: paymentsByStatus.proof_uploaded || 0,
        awaitingPayment: paymentsByStatus.awaiting_proof || 0,
      },
      drivers: {
        total: Number(driverSummary.total),
        approved: Number(driverSummary.approved),
        pending: Number(driverSummary.total)-Number(driverSummary.approved),
      },
      bookingsByStatus,
      paymentsByStatus,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('getStats error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/admin/reports?range=day|week|month|quarter|half|year ---
// Time-windowed analytics for the admin Reports tab + CSV export. Returns
// totals, a day/month-bucketed series, and the raw rows (so the frontend can
// build a CSV without a separate endpoint). Aggregated in JS for the MVP.
const RANGE_DAYS = { day: 1, week: 7, month: 30, quarter: 90, half: 180, year: 365 };

async function getReports(req, res) {
  try {
    const range = RANGE_DAYS[req.query.range] ? req.query.range : 'month';
    const days = RANGE_DAYS[range];
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await adminRepository.reportBookings(from);
    const byMonth = days > 90; // bucket by month for long ranges, else by day
    const series = {};
    let revenue = 0;
    let completed = 0;
    let cancelled = 0;

    for (const b of rows) {
      const d = new Date(b.created_at);
      const key = byMonth
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : d.toISOString().slice(0, 10);
      if (!series[key]) series[key] = { bucket: key, count: 0, revenue: 0 };
      series[key].count += 1;
      const fare = Number(b.fare_amount) || 0;
      if (b.payment_status === 'verified') {
        series[key].revenue += fare;
        revenue += fare;
      }
      if (b.booking_status === 'completed') completed += 1;
      if (b.booking_status === 'cancelled') cancelled += 1;
    }

    const round = (n) => Math.round(n * 100) / 100;
    return res.json({
      range,
      granularity: byMonth ? 'month' : 'day',
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        bookings: rows.length,
        completed,
        cancelled,
        revenue: round(revenue),
        currency: 'SAR',
      },
      series: Object.values(series).map((s) => ({ ...s, revenue: round(s.revenue) })),
      rows,
    });
  } catch (err) {
    console.error('getReports error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/admin/drivers ------------------------------------------
async function listDrivers(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    
    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    const { rows, total } = await adminRepository.listDrivers({
      limit, offset, search, sortBy, sortOrder, filters: filtersObj,
    });

    const drivers = rows.map(r => ({
      ...r,
      status: r.driver_approved ? 'approved' : 'pending',
      verification_status: r.driver_verification_status,
    }));

    return res.json({
      data: drivers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      sort: { sortBy, sortOrder },
      filters: filtersObj,
    });
  } catch (err) {
    console.error('listDrivers error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/admin/drivers/:driverId/approval ----------------------
async function setDriverApproval(req, res) {
  try {
    const approved = req.body && req.body.approved !== false; // default true
    const data = await adminRepository.setDriverApproval(req.params.driverId, approved);
    if (!data) return res.status(404).json({ error: 'Driver not found' });
    return res.json({ id: data.id, fullName: data.full_name, driverApproved: data.driver_approved });
  } catch (err) {
    console.error('setDriverApproval error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/admin/drivers/cash -------------------------------------
// Drivers who hold Alabiq's money from cash pick & drop rides: how
// much each owes, whether they've hit the cap (blocked from new cash
// rides), and their most recent settlement. Owing drivers first.
async function listDriverCash(req, res) {
  try {
    const data = await adminRepository.listDriverCash();

    const drivers = (data || []).map((d) => ({
      id: d.id,
      fullName: d.full_name,
      whatsapp: d.whatsapp_number,
      mobile: d.mobile_number,
      ...driverCashView(d),
    }));
    const totalOwed = drivers.reduce((sum, d) => sum + d.cashOwed, 0);
    return res.json({ drivers, totalOwed: Math.round(totalOwed * 100) / 100 });
  } catch (err) {
    console.error('listDriverCash error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/admin/drivers/:driverId/settle-cash -------------------
// Record that a driver paid Alabiq toward what they owe (weekly
// settlement). Reduces cash_owed and writes a 'settlement' ledger row;
// dropping back under the cap lifts their cash-ride block automatically.
async function settleDriverCash(req, res) {
  try {
    const amount = Number(req.body && req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const driver = await adminRepository.driverIdentity(req.params.driverId);
    if (!driver || driver.role !== 'driver') return res.status(404).json({ error: 'Driver not found' });

    const result = await settleDriverCashBalance({
      driverId: driver.id,
      amount,
      adminId: adminId(req),
      note: (req.body && req.body.note) || null,
    });
    if (result.error) {
      console.error('settleDriverCash error:', result.error);
      return res.status(500).json({ error: 'Could not record the settlement' });
    }

    const fresh = await adminRepository.cashProfile(driver.id);
    return res.json({ driverId: driver.id, ...driverCashView(fresh || { cash_owed: result.balanceAfter }) });
  } catch (err) {
    console.error('settleDriverCash error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function loadBooking(bookingCode) {
  return adminRepository.bookingByCode(bookingCode);
}

// Latest proof id for a booking (the one under review), or null.
async function latestProofId(bookingId) {
  return adminRepository.latestProofId(bookingId);
}

// --- GET /api/admin/bookings -----------------------------------------
async function listBookings(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = (req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    
    let filtersObj = {};
    try {
      filtersObj = req.query.filters ? JSON.parse(req.query.filters) : {};
    } catch {
      filtersObj = {};
    }

    // Backward compatibility: booking_status, payment_status
    const bookingStatus = filtersObj.booking_status || req.query.booking_status;
    const paymentStatus = filtersObj.payment_status || req.query.payment_status;

    const { rows, total } = await adminRepository.listBookings({
      limit, offset, bookingStatus, paymentStatus, search, sortBy, sortOrder, filters: filtersObj,
    });

    const bookings = rows.map(r => ({
      ...r,
      // Map status labels for UI
      booking_status_label: r.booking_status,
      payment_status_label: r.payment_status,
    }));

    return res.json({
      data: bookings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      sort: { sortBy, sortOrder },
      filters: filtersObj,
    });
  } catch (err) {
    console.error('listBookings error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/admin/bookings/:bookingCode ----------------------------
async function getBookingDetail(req, res) {
  try {
    const booking = await adminRepository.bookingDetail(req.params.bookingCode);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const proofs = await adminRepository.proofs(booking.id);

    // Attach a short-lived signed download URL to each proof so the admin
    // can view the private file. Best-effort per proof.
    const proofsWithUrls = await Promise.all(
      (proofs || []).map(async (p) => {
        let downloadUrl = null;
        try {
          downloadUrl = await createProofDownloadUrl(p.file_url);
        } catch (e) {
          console.error('proof signed url error:', e);
        }
        return { ...p, downloadUrl };
      })
    );

    const payments = await adminRepository.payments(booking.id);

    // Assigned driver (name/phone) + when the assignment happened, so the
    // admin sees Accepted Time / Assigned Driver / delivery status at a
    // glance and can reassign if the driver goes quiet.
    let driver = null;
    let driverAssignedAt = null;
    if (booking.assigned_driver_id) {
      driver = await adminRepository.driverContact(booking.assigned_driver_id);
      driverAssignedAt = await adminRepository.driverAssignedAt(booking.id);
    }

    return res.json({ booking, proofs: proofsWithUrls, payments, driver, driverAssignedAt });
  } catch (err) {
    console.error('getBookingDetail error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/admin/bookings/:bookingCode/verify-payment ------------
async function verifyPayment(req, res) {
  try {
    const booking = await loadBooking(req.params.bookingCode);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.payment_status === 'verified') {
      return res.status(409).json({ error: 'Payment already verified' });
    }
    // Cash rides have no online payment to verify; the fare is collected by
    // the driver at completion. Verifying here would reset booking_status to
    // 'confirmed' and re-dispatch an already-assigned ride.
    if (booking.payment_method === 'cash') {
      return res.status(409).json({ error: 'Cash bookings are settled by the driver at pickup — nothing to verify here' });
    }

    const proofId = await latestProofId(booking.id);
    const { booking: updated, error } = await verifyBookingPayment({
      booking,
      mode: 'admin_manual',
      adminId: adminId(req),
      proofId,
      manualReference: (req.body && req.body.manual_reference) || null,
    });
    if (error) { console.error('admin query error:', error); return res.status(500).json({ error: 'Unexpected server error' }); }

    return res.json({
      bookingCode: updated.booking_code,
      paymentStatus: updated.payment_status,
      bookingStatus: updated.booking_status,
    });
  } catch (err) {
    console.error('verifyPayment error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/admin/bookings/:bookingCode/reject-payment ------------
async function rejectPayment(req, res) {
  try {
    const reason = (req.body && req.body.reason) || null;
    if (!reason) {
      return res.status(400).json({ error: 'reason is required to reject a payment' });
    }

    const booking = await loadBooking(req.params.bookingCode);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.payment_status === 'verified') {
      return res.status(409).json({ error: 'Payment already verified; cannot reject' });
    }

    const proofId = await latestProofId(booking.id);
    const { booking: updated, error } = await rejectBookingPayment({
      booking,
      adminId: adminId(req),
      reason,
      proofId,
    });
    if (error) { console.error('admin query error:', error); return res.status(500).json({ error: 'Unexpected server error' }); }

    return res.json({
      bookingCode: updated.booking_code,
      paymentStatus: updated.payment_status,
      bookingStatus: updated.booking_status,
    });
  } catch (err) {
    console.error('rejectPayment error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/admin/bookings/:bookingCode/assign-driver -------------
async function assignDriver(req, res) {
  try {
    const driverId = req.body && req.body.driver_id;
    if (!driverId) {
      return res.status(400).json({ error: 'driver_id is required' });
    }

    const booking = await loadBooking(req.params.bookingCode);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    // Cash bookings are confirmed on creation (fare collected at pickup);
    // STC Pay bookings need a verified payment before a driver is assigned.
    if (booking.payment_status !== 'verified' && booking.payment_method !== 'cash') {
      return res.status(409).json({ error: 'Cannot assign a driver before payment is verified' });
    }

    // Confirm the target is a real driver profile.
    const driver = await adminRepository.driverForAssignment(driverId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }
    if (driver.role !== 'driver') {
      return res.status(400).json({ error: 'Target profile is not a driver' });
    }

    const updated = await adminRepository.assignDriver(booking.id, driver.id);
    if (!updated) return res.status(409).json({ error: 'Could not assign driver to this booking' });

    await addTrackingEvent(booking.id, {
      eventType: 'driver_assigned',
      title: 'Driver assigned',
      message: `${driver.full_name || 'Your driver'} has been assigned to your trip.`,
      createdByUserId: adminId(req),
    });

    // Realtime: tell the passenger, and pull the ride from the open feed.
    pushBookingStatus(updated.booking_code, {
      bookingStatus: 'driver_assigned',
      driverRideStatus: 'assigned',
      driver: { name: driver.full_name, whatsapp: null },
    });
    announceRequestTaken(updated.booking_code);

    return res.json({
      bookingCode: updated.booking_code,
      bookingStatus: updated.booking_status,
      driverRideStatus: updated.driver_ride_status,
    });
  } catch (err) {
    console.error('assignDriver error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/admin/drivers/:driverId/documents ----------------------
// Lists a driver's verification documents with short-lived signed download URLs.
async function listDriverDocuments(req, res) {
  try {
    const driver = await adminRepository.driverDocumentSummary(req.params.driverId);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    const docs = await adminRepository.driverDocuments(req.params.driverId);

    // Attach a signed download URL per doc (best-effort; never expose storage_path).
    const documents = [];
    for (const d of docs) {
      let url = null;
      try { url = await createDriverDocDownloadUrl(d.storage_path); } catch (e) { console.error('signed url error:', e.message); }
      const { storage_path, ...safe } = d;
      documents.push({ ...safe, url });
    }

    return res.json({
      driver: {
        id: driver.id,
        fullName: driver.full_name,
        email: driver.email,
        whatsapp: driver.whatsapp_number,
        driverApproved: driver.driver_approved,
        verificationStatus: driver.driver_verification_status,
      },
      requiredTypes: config.driverDocs.requiredTypes,
      documents,
    });
  } catch (err) {
    console.error('listDriverDocuments error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- POST /api/admin/drivers/:driverId/documents/:docId/review -------
// Verify or reject a single document; auto-approve the driver once all
// required documents are verified.
async function reviewDriverDocument(req, res) {
  try {
    const status = req.body && req.body.status;
    if (status !== 'verified' && status !== 'rejected') {
      return res.status(400).json({ error: "status must be 'verified' or 'rejected'" });
    }
    const reason = status === 'rejected' ? ((req.body && req.body.rejection_reason) || null) : null;
    if (status === 'rejected' && !reason) {
      return res.status(400).json({ error: 'rejection_reason is required when rejecting' });
    }

    const review = await adminRepository.reviewDriverDocument({
      driverId:req.params.driverId,docId:req.params.docId,status,reason,adminId:adminId(req),
      requiredTypes:config.driverDocs.requiredTypes,
    });
    if (!review) return res.status(404).json({ error: 'Document not found for this driver' });
    const {doc,driverApproved,verificationStatus,allRequiredVerified}= {
      doc:review,driverApproved:review.driverApproved,verificationStatus:review.verificationStatus,
      allRequiredVerified:review.allRequiredVerified,
    };

    return res.json({
      docId: doc.id,
      docType: doc.doc_type,
      status: doc.status,
      driverApproved,
      verificationStatus,
      allRequiredVerified,
    });
  } catch (err) {
    console.error('reviewDriverDocument error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = {
  getStats,
  getReports,
  listBookings,
  getBookingDetail,
  verifyPayment,
  rejectPayment,
  assignDriver,
  listDrivers,
  setDriverApproval,
  listDriverCash,
  settleDriverCash,
  listDriverDocuments,
  reviewDriverDocument,
};
