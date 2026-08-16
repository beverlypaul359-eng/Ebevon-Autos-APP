const { query, withTransaction } = require('../db/pool');
const { ok, created } = require('../utils/respond');
const AppError = require('../utils/AppError');
const logger   = require('../utils/logger');

const INSPECTION_FEE = 10000; // ₦10,000

/* ══════════════════════════════════════════════
   REQUEST INSPECTION (buyer)
══════════════════════════════════════════════ */
exports.requestInspection = async (req, res) => {
  const requesterId = req.user.id;
  const {
    carId, contactName, contactPhone,
    preferredDate1, preferredDate2,
    inspectionAddress, inspectionState,
    buyerNotes, escrowId,
  } = req.body;

  // Verify car exists and is live
  const { rows: carRows } = await query(
    `SELECT c.*, u.first_name || ' ' || u.last_name AS seller_name,
            u.phone AS seller_phone, u.email AS seller_email
     FROM cars c JOIN users u ON u.id = c.seller_id
     WHERE c.id = $1 AND c.status IN ('live','sold')`,
    [carId]
  );
  if (!carRows.length) throw new AppError('Car listing not found or no longer available', 404);
  const car = carRows[0];

  // Prevent seller from requesting inspection on own car
  if (car.seller_id === requesterId)
    throw new AppError('You cannot request an inspection for your own listing', 400);

  // Check for duplicate pending/scheduled request from same user
  const { rows: existing } = await query(
    `SELECT id FROM inspection_requests
     WHERE car_id = $1 AND requester_id = $2 AND status IN ('pending','scheduled','in_progress')`,
    [carId, requesterId]
  );
  if (existing.length)
    throw new AppError('You already have an active inspection request for this car', 409, 'INSPECTION_EXISTS');

  const { rows } = await query(
    `INSERT INTO inspection_requests
       (car_id, requester_id, escrow_id, contact_name, contact_phone,
        preferred_date_1, preferred_date_2, inspection_address, inspection_state,
        buyer_notes, fee_ngn, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
     RETURNING *`,
    [
      carId, requesterId, escrowId || null,
      contactName, contactPhone,
      preferredDate1 || null, preferredDate2 || null,
      inspectionAddress || car.location_state || null,
      inspectionState   || car.location_state || null,
      buyerNotes || null,
      INSPECTION_FEE,
    ]
  );

  logger.info(`Inspection requested: car ${carId} by user ${requesterId}`);

  return created(res, {
    inspection: rows[0],
    feeNgn:     INSPECTION_FEE,
    car: {
      id: car.id, brand: car.brand, model: car.model,
      year: car.year, location: car.location_state,
    },
  }, `Inspection request submitted. Our team will contact you within 24 hours. Fee: ₦${INSPECTION_FEE.toLocaleString()}`);
};

/* ══════════════════════════════════════════════
   GET MY INSPECTION REQUESTS (buyer)
══════════════════════════════════════════════ */
exports.myRequests = async (req, res) => {
  const { rows } = await query(
    `SELECT ir.*,
            c.brand, c.model, c.year, c.location_state, c.photos[1] AS car_thumb,
            u.first_name || ' ' || u.last_name AS seller_name
     FROM inspection_requests ir
     JOIN cars  c ON c.id  = ir.car_id
     JOIN users u ON u.id  = c.seller_id
     WHERE ir.requester_id = $1
     ORDER BY ir.created_at DESC`,
    [req.user.id]
  );
  return ok(res, { requests: rows });
};

/* ══════════════════════════════════════════════
   GET SINGLE INSPECTION REQUEST
══════════════════════════════════════════════ */
exports.getRequest = async (req, res) => {
  const { rows } = await query(
    `SELECT ir.*,
            c.brand, c.model, c.year, c.location_state,
            c.photos, c.vin, c.health_score,
            u.first_name || ' ' || u.last_name AS seller_name,
            u.phone AS seller_phone
     FROM inspection_requests ir
     JOIN cars  c ON c.id  = ir.car_id
     JOIN users u ON u.id  = c.seller_id
     WHERE ir.id = $1
       AND (ir.requester_id = $2 OR $3 = 'admin')`,
    [req.params.id, req.user.id, req.user.role]
  );
  if (!rows.length) throw new AppError('Inspection request not found', 404);
  return ok(res, { request: rows[0] });
};

/* ══════════════════════════════════════════════
   CANCEL INSPECTION (buyer — only if pending)
══════════════════════════════════════════════ */
exports.cancelRequest = async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM inspection_requests WHERE id = $1 AND requester_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) throw new AppError('Request not found', 404);
  if (!['pending','scheduled'].includes(rows[0].status))
    throw new AppError('Cannot cancel an inspection that is already in progress or completed', 400);

  await query(
    `UPDATE inspection_requests SET status='cancelled', updated_at=NOW() WHERE id=$1`,
    [req.params.id]
  );
  return ok(res, {}, 'Inspection request cancelled.');
};

/* ══════════════════════════════════════════════
   SCHEDULE INSPECTION (admin)
══════════════════════════════════════════════ */
exports.scheduleInspection = async (req, res) => {
  const { scheduledAt, inspectorName, assignedTo, adminNotes } = req.body;

  const { rows } = await query(
    `UPDATE inspection_requests
     SET status='scheduled',
         scheduled_at   = $1,
         inspector_name = $2,
         assigned_to    = $3,
         admin_notes    = COALESCE($4, admin_notes),
         updated_at     = NOW()
     WHERE id = $5
     RETURNING *`,
    [scheduledAt, inspectorName || null, assignedTo || null, adminNotes || null, req.params.id]
  );
  if (!rows.length) throw new AppError('Inspection request not found', 404);
  return ok(res, { request: rows[0] }, 'Inspection scheduled.');
};

/* ══════════════════════════════════════════════
   SUBMIT INSPECTION REPORT (admin / inspector)
══════════════════════════════════════════════ */
exports.submitReport = async (req, res) => {
  const {
    inspectorNotes, overallGrade,
    passed, reportUrl, inspectedAt,
  } = req.body;

  if (!['A','B','C','D','F'].includes(overallGrade))
    throw new AppError('Grade must be A, B, C, D, or F', 400);

  const { rows } = await query(
    `UPDATE inspection_requests
     SET status           = 'completed',
         inspector_notes  = $1,
         overall_grade    = $2,
         passed           = $3,
         report_url       = $4,
         inspected_at     = COALESCE($5, NOW()),
         updated_at       = NOW()
     WHERE id = $6
     RETURNING *`,
    [inspectorNotes, overallGrade, !!passed, reportUrl || null, inspectedAt || null, req.params.id]
  );
  if (!rows.length) throw new AppError('Inspection request not found', 404);

  logger.info(`Inspection ${req.params.id} completed. Grade: ${overallGrade}, Passed: ${passed}`);
  return ok(res, { request: rows[0] }, 'Inspection report submitted.');
};

/* ══════════════════════════════════════════════
   ADMIN — LIST ALL REQUESTS (filtered)
══════════════════════════════════════════════ */
exports.adminListRequests = async (req, res) => {
  const { status, state, page = 1, limit = 20 } = req.query;
  const params  = [];
  const filters = [];

  if (status) { params.push(status); filters.push(`ir.status = $${params.length}`); }
  if (state)  { params.push(`%${state}%`); filters.push(`ir.inspection_state ILIKE $${params.length}`); }

  const where  = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { rows } = await query(
    `SELECT ir.*,
            c.brand, c.model, c.year, c.location_state,
            u.first_name || ' ' || u.last_name AS requester_name,
            u.phone AS requester_phone, u.email AS requester_email
     FROM inspection_requests ir
     JOIN cars  c ON c.id = ir.car_id
     JOIN users u ON u.id = ir.requester_id
     ${where}
     ORDER BY ir.created_at DESC
     LIMIT ${parseInt(limit)} OFFSET ${offset}`,
    params
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*) FROM inspection_requests ir ${where}`, params
  );

  return ok(res, { requests: rows, total: parseInt(countRows[0].count) });
};

/* ══════════════════════════════════════════════
   GET INSPECTION STATS (for dashboards)
══════════════════════════════════════════════ */
exports.getStats = async (req, res) => {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status='pending')     AS pending,
       COUNT(*) FILTER (WHERE status='scheduled')   AS scheduled,
       COUNT(*) FILTER (WHERE status='in_progress') AS in_progress,
       COUNT(*) FILTER (WHERE status='completed')   AS completed,
       COUNT(*) FILTER (WHERE status='cancelled')   AS cancelled,
       COUNT(*) FILTER (WHERE passed=TRUE)          AS passed,
       COUNT(*) FILTER (WHERE passed=FALSE)         AS failed,
       SUM(fee_ngn) FILTER (WHERE status='completed') AS total_fees_ngn
     FROM inspection_requests`
  );
  return ok(res, { stats: rows[0] });
};
