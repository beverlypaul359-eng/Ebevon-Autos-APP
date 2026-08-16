const { query, withTransaction } = require('../db/pool');
const { verifyVin }  = require('../services/vinService');
const { ok, created }= require('../utils/respond');
const AppError       = require('../utils/AppError');

/* ══════════════════════════════════════════════
   CREATE LISTING
   VIN is accepted here, immediately verified
   against NHTSA, then NEVER returned to any
   client — it is internal-only.
══════════════════════════════════════════════ */
exports.createListing = async (req, res) => {
  const sellerId = req.user.id;
  const {
    brand, model, year, vin, condition, bodyType, colour,
    fuelType, transmission, engineSize, mileageKm, powerHp, seats,
    priceNgn, negotiable, deliveryAvailable, description, locationState,
    healthScore, healthEngine, healthTransmission, healthExterior,
    healthInterior, healthBrakes, healthTyres,
    photos, videoExterior, videoInterior, videoStartup,
  } = req.body;

  // VIN is mandatory — it must be supplied to create any listing
  if (!vin || vin.trim().length !== 17)
    throw new AppError('A valid 17-character VIN is required to list a car', 400, 'VIN_REQUIRED');

  // Business rule: Brand New must be 100
  const finalHealth = condition === 'brand_new' ? 100 : Math.min(99, Math.max(1, healthScore || 80));

  // ── KYC gate ──
  if (req.user.kyc_status !== 'approved')
    throw new AppError('Identity verification (KYC) must be approved before listing cars', 403, 'KYC_REQUIRED');

  // ── Run VIN verification immediately ──
  const vinResult = await verifyVin({ vin: vin.trim().toUpperCase(), brand, model, year });

  if (!vinResult.valid) {
    throw new AppError(
      `VIN verification failed: ${vinResult.errors.join('. ')} — Please check your VIN and car details.`,
      422, 'VIN_INVALID'
    );
  }

  // Determine initial status
  // - Perfect match  → straight to 'pending_review' (admin checks then goes live)
  // - Partial match  → 'pending_review' with warnings logged
  const initStatus    = vinResult.match ? 'pending_review' : 'pending_review';
  const vinVerified   = vinResult.valid;
  const vinWarnings   = vinResult.errors.length > 0 ? vinResult.errors : null;

  const { rows } = await query(
    `INSERT INTO cars (
       seller_id, brand, model, year, vin, condition, body_type, colour,
       fuel_type, transmission, engine_size, mileage_km, power_hp, seats,
       price_ngn, negotiable, delivery_available, description, location_state,
       health_score, health_engine, health_transmission, health_exterior,
       health_interior, health_brakes, health_tyres,
       photos, video_exterior, video_interior, video_startup,
       vin_verified, vin_data, vin_checked_at,
       status
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,
       $9,$10,$11,$12,$13,$14,
       $15,$16,$17,$18,$19,
       $20,$21,$22,$23,$24,$25,$26,
       $27,$28,$29,$30,
       $31,$32,NOW(),
       $33
     ) RETURNING id, brand, model, year, condition, status, vin_verified, created_at`,
    /* NOTE: vin itself is stored but NEVER selected in public queries */
    [
      sellerId, brand, model, year, vin.trim().toUpperCase(), condition, bodyType || null, colour || null,
      fuelType || null, transmission || null, engineSize || null,
      mileageKm || null, powerHp || null, seats || null,
      priceNgn, negotiable !== false, deliveryAvailable || false,
      description || null, locationState || null,
      finalHealth, healthEngine || null, healthTransmission || null,
      healthExterior || null, healthInterior || null,
      healthBrakes || null, healthTyres || null,
      photos || [], videoExterior || null, videoInterior || null, videoStartup || null,
      vinVerified,
      JSON.stringify({ ...vinResult.data, warnings: vinWarnings }),
      initStatus,
    ]
  );

  const msg = vinResult.match
    ? 'Listing submitted for review. It will go live once our team approves it.'
    : `Listing submitted. VIN verified but some details had minor mismatches (${vinResult.errors.join('; ')}). Under review.`;

  // Return ONLY safe fields — VIN is intentionally excluded
  return created(res, {
    car: rows[0], // contains only: id, brand, model, year, condition, status, vin_verified, created_at
    vinVerified,
    warnings: vinWarnings,
  }, msg);
};

/* ══════════════════════════════════════════════
   GET ALL LISTINGS (public)
   VIN and vin_data are NEVER selected here —
   they are internal-only fields.
══════════════════════════════════════════════ */
exports.getListings = async (req, res) => {
  const {
    brand, model, year, condition, fuelType, locationState,
    minPrice, maxPrice, minHealth, maxHealth,
    sortBy = 'newest', page = 1, limit = 12,
  } = req.query;

  const params  = ['live'];
  const filters = ['c.status = $1'];
  let   p       = 1;

  const add = (clause, val) => { params.push(val); filters.push(clause.replace('?', `$${++p}`)); };

  if (brand)         add(`c.brand ILIKE ?`,       `%${brand}%`);
  if (model)         add(`c.model ILIKE ?`,        `%${model}%`);
  if (year)          add(`c.year = ?`,              parseInt(year));
  if (condition)     add(`c.condition = ?`,         condition);
  if (fuelType)      add(`c.fuel_type ILIKE ?`,    `%${fuelType}%`);
  if (locationState) add(`c.location_state ILIKE ?`, `%${locationState}%`);
  if (minPrice)      add(`c.price_ngn >= ?`,        parseInt(minPrice));
  if (maxPrice)      add(`c.price_ngn <= ?`,        parseInt(maxPrice));
  if (minHealth)     add(`c.health_score >= ?`,     parseInt(minHealth));
  if (maxHealth)     add(`c.health_score <= ?`,     parseInt(maxHealth));

  const orderMap = {
    newest:     'c.published_at DESC',
    price_asc:  'c.price_ngn ASC',
    price_desc: 'c.price_ngn DESC',
    health:     'c.health_score DESC',
  };
  const order = orderMap[sortBy] || orderMap.newest;

  const offset   = (parseInt(page) - 1) * parseInt(limit);
  const whereSQL = filters.join(' AND ');

  const { rows } = await query(
    /* Explicitly select every column EXCEPT vin and vin_data — they are internal only */
    `SELECT c.id, c.seller_id, c.status, c.brand, c.model, c.year, c.condition,
            c.body_type, c.colour, c.fuel_type, c.transmission, c.engine_size,
            c.mileage_km, c.power_hp, c.seats, c.price_ngn, c.negotiable,
            c.delivery_available, c.description, c.location_state,
            c.vin_verified, c.vin_checked_at,
            c.health_score, c.health_engine, c.health_transmission, c.health_exterior,
            c.health_interior, c.health_brakes, c.health_tyres,
            c.photos, c.video_exterior, c.video_interior, c.video_startup,
            c.view_count, c.published_at, c.created_at,
            u.first_name || ' ' || u.last_name AS seller_name,
            u.dealership_name, u.is_dealer, u.kyc_status AS seller_kyc,
            u.passkey_registered
     FROM cars c
     JOIN users u ON u.id = c.seller_id
     WHERE ${whereSQL}
     ORDER BY ${order}
     LIMIT ${parseInt(limit)} OFFSET ${offset}`,
    params
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*) FROM cars c WHERE ${whereSQL}`, params
  );

  return ok(res, { cars: rows, total: parseInt(countRows[0].count), page: parseInt(page), limit: parseInt(limit) });
};

/* ══════════════════════════════════════════════
   GET SINGLE LISTING
══════════════════════════════════════════════ */
exports.getListing = async (req, res) => {
  const { rows } = await query(
    /* vin and vin_data deliberately excluded — internal use only */
    `SELECT c.id, c.seller_id, c.status, c.brand, c.model, c.year, c.condition,
            c.body_type, c.colour, c.fuel_type, c.transmission, c.engine_size,
            c.mileage_km, c.power_hp, c.seats, c.price_ngn, c.negotiable,
            c.delivery_available, c.description, c.location_state,
            c.vin_verified, c.vin_checked_at,
            c.health_score, c.health_engine, c.health_transmission, c.health_exterior,
            c.health_interior, c.health_brakes, c.health_tyres,
            c.photos, c.video_exterior, c.video_interior, c.video_startup,
            c.view_count, c.published_at, c.created_at,
            u.first_name || ' ' || u.last_name AS seller_name,
            u.dealership_name, u.is_dealer, u.kyc_status AS seller_kyc,
            u.location_state AS seller_state
     FROM cars c
     JOIN users u ON u.id = c.seller_id
     WHERE c.id=$1`,
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Listing not found', 404);

  // Increment view count asynchronously
  query(`UPDATE cars SET view_count=view_count+1 WHERE id=$1`, [req.params.id]).catch(() => {});

  return ok(res, { car: rows[0] });
};

/* ══════════════════════════════════════════════
   UPDATE LISTING
══════════════════════════════════════════════ */
exports.updateListing = async (req, res) => {
  const { rows } = await query(`SELECT * FROM cars WHERE id=$1 AND seller_id=$2`, [req.params.id, req.user.id]);
  if (!rows.length) throw new AppError('Listing not found', 404);
  if (rows[0].status === 'sold') throw new AppError('Cannot edit a sold listing', 400);

  const allowed = [
    'description','price_ngn','negotiable','delivery_available',
    'health_score','health_engine','health_transmission','health_exterior',
    'health_interior','health_brakes','health_tyres',
    'photos','video_exterior','video_interior','video_startup','colour',
  ];

  const sets   = [];
  const values = [];
  let   idx    = 1;

  for (const [k, v] of Object.entries(req.body)) {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(col)) {
      sets.push(`${col}=$${idx++}`);
      values.push(v);
    }
  }

  if (!sets.length) throw new AppError('No valid fields to update', 400);
  values.push(req.params.id);

  const { rows: updated } = await query(
    `UPDATE cars SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`,
    values
  );
  return ok(res, { car: updated[0] });
};

/* ══════════════════════════════════════════════
   DELETE LISTING
══════════════════════════════════════════════ */
exports.deleteListing = async (req, res) => {
  const { rows } = await query(`SELECT status FROM cars WHERE id=$1 AND seller_id=$2`, [req.params.id, req.user.id]);
  if (!rows.length) throw new AppError('Listing not found', 404);
  if (rows[0].status === 'sold') throw new AppError('Cannot delete a sold listing', 400);
  await query(`UPDATE cars SET status='removed', updated_at=NOW() WHERE id=$1`, [req.params.id]);
  return ok(res, {}, 'Listing removed.');
};

/* ══════════════════════════════════════════════
   SELLER — MY LISTINGS
══════════════════════════════════════════════ */
exports.myListings = async (req, res) => {
  /* Seller sees their own listings but NOT the VIN — it was submitted for verification only */
  const { rows } = await query(
    `SELECT id, brand, model, year, condition, status, price_ngn, negotiable,
            delivery_available, location_state, health_score, photos,
            vin_verified, vin_checked_at, view_count, published_at, created_at, updated_at
     FROM cars WHERE seller_id=$1 AND status != 'removed' ORDER BY created_at DESC`,
    [req.user.id]
  );
  return ok(res, { cars: rows });
};

/* ══════════════════════════════════════════════
   SAVE / UNSAVE CAR (buyer)
══════════════════════════════════════════════ */
exports.saveCar = async (req, res) => {
  await query(
    `INSERT INTO saved_cars (user_id, car_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [req.user.id, req.params.id]
  );
  return ok(res, {}, 'Car saved.');
};

exports.unsaveCar = async (req, res) => {
  await query(`DELETE FROM saved_cars WHERE user_id=$1 AND car_id=$2`, [req.user.id, req.params.id]);
  return ok(res, {}, 'Removed from saved.');
};

exports.savedCars = async (req, res) => {
  const { rows } = await query(
    `SELECT c.* FROM saved_cars sc JOIN cars c ON c.id=sc.car_id
     WHERE sc.user_id=$1 ORDER BY sc.saved_at DESC`,
    [req.user.id]
  );
  return ok(res, { cars: rows });
};
