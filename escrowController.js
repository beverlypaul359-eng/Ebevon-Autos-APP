const Stripe   = require('stripe');
const config   = require('../config');
const { query, withTransaction } = require('../db/pool');
const { ok, created } = require('../utils/respond');
const AppError = require('../utils/AppError');
const logger   = require('../utils/logger');

const stripe = config.stripe.secretKey ? Stripe(config.stripe.secretKey) : null;

const PLATFORM_FEE_PCT = 0.05; // 5%

/* ══════════════════════════════════════════════
   INITIATE ESCROW — buyer pays
══════════════════════════════════════════════ */
exports.initiateEscrow = async (req, res) => {
  const buyerId = req.user.id;
  const { carId, deliveryAddress, deliveryPhone } = req.body;

  const { rows: carRows } = await query(
    `SELECT c.*, u.email AS seller_email FROM cars c
     JOIN users u ON u.id = c.seller_id
     WHERE c.id=$1 AND c.status='live'`,
    [carId]
  );
  if (!carRows.length) throw new AppError('Car not found or not available', 404);

  const car = carRows[0];

  if (car.seller_id === buyerId) throw new AppError('You cannot buy your own listing', 400);

  // Check no active escrow already
  const { rows: existing } = await query(
    `SELECT id FROM escrow_transactions WHERE car_id=$1 AND status NOT IN ('refunded','released')`,
    [carId]
  );
  if (existing.length) throw new AppError('This car already has an active transaction', 409);

  const platformFee   = Math.round(car.price_ngn * PLATFORM_FEE_PCT);
  const sellerPayout  = car.price_ngn - platformFee;

  // Create Stripe PaymentIntent
  let paymentIntent = null;
  if (stripe) {
    paymentIntent = await stripe.paymentIntents.create({
      amount:   car.price_ngn,           // in kobo (smallest NGN unit) — adjust if using USD
      currency: 'ngn',
      capture_method: 'manual',          // capture only when buyer confirms
      metadata: { carId, buyerId, sellerId: car.seller_id },
      description: `EBEVON Escrow: ${car.year} ${car.brand} ${car.model}`,
    });
  }

  const { rows } = await withTransaction(async (client) => {
    // Lock the car
    await client.query(`UPDATE cars SET status='sold', updated_at=NOW() WHERE id=$1`, [carId]);

    return client.query(
      `INSERT INTO escrow_transactions
         (car_id, buyer_id, seller_id, amount_ngn, platform_fee_ngn, seller_payout_ngn,
          status, stripe_payment_intent_id, delivery_address, delivery_phone, delivery_status)
       VALUES ($1,$2,$3,$4,$5,$6,'created',$7,$8,$9,$10)
       RETURNING *`,
      [
        carId, buyerId, car.seller_id, car.price_ngn, platformFee, sellerPayout,
        paymentIntent?.id || null,
        deliveryAddress || null, deliveryPhone || null,
        deliveryAddress ? 'requested' : 'none',
      ]
    );
  });

  return created(res, {
    escrowId:         rows[0].id,
    amountNgn:        car.price_ngn,
    clientSecret:     paymentIntent?.client_secret || null,
    paymentIntentId:  paymentIntent?.id || null,
  }, 'Escrow initiated. Complete payment to lock funds.');
};

/* ══════════════════════════════════════════════
   CONFIRM RECEIPT — buyer confirms car received
   → releases funds to seller
══════════════════════════════════════════════ */
exports.confirmReceipt = async (req, res) => {
  const { id } = req.params;

  const { rows } = await query(
    `SELECT * FROM escrow_transactions WHERE id=$1 AND buyer_id=$2`,
    [id, req.user.id]
  );
  if (!rows.length) throw new AppError('Transaction not found', 404);

  const tx = rows[0];
  if (tx.status !== 'funded' && tx.status !== 'inspecting')
    throw new AppError(`Cannot confirm from status: ${tx.status}`, 400);

  // Capture the Stripe payment and transfer to seller
  if (stripe && tx.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.capture(tx.stripe_payment_intent_id);
      logger.info(`Stripe capture: ${tx.stripe_payment_intent_id}`);
    } catch (err) {
      logger.error(`Stripe capture failed: ${err.message}`);
      throw new AppError('Payment capture failed. Contact support.', 502, 'STRIPE_ERROR');
    }
  }

  await query(
    `UPDATE escrow_transactions
     SET status='released', confirmed_at=NOW(), released_at=NOW(), updated_at=NOW()
     WHERE id=$1`,
    [id]
  );

  logger.info(`Escrow ${id} released. Payout ₦${tx.seller_payout_ngn} to seller ${tx.seller_id}`);

  return ok(res, { escrowId: id, payoutNgn: tx.seller_payout_ngn }, 'Receipt confirmed. Funds released to seller.');
};

/* ══════════════════════════════════════════════
   RAISE DISPUTE
══════════════════════════════════════════════ */
exports.raiseDispute = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const { rows } = await query(
    `SELECT * FROM escrow_transactions WHERE id=$1 AND buyer_id=$2`,
    [id, req.user.id]
  );
  if (!rows.length) throw new AppError('Transaction not found', 404);
  if (!['funded','inspecting'].includes(rows[0].status))
    throw new AppError('Cannot dispute at this stage', 400);
  if (!reason) throw new AppError('Dispute reason required', 400);

  await query(
    `UPDATE escrow_transactions
     SET status='disputed', dispute_reason=$1, disputed_at=NOW(), updated_at=NOW()
     WHERE id=$2`,
    [reason, id]
  );

  return ok(res, { escrowId: id }, 'Dispute raised. Our team will review within 24–48 hours.');
};

/* ══════════════════════════════════════════════
   GET ESCROW DETAILS
══════════════════════════════════════════════ */
exports.getEscrow = async (req, res) => {
  const { rows } = await query(
    `SELECT et.*, c.brand, c.model, c.year, c.photos
     FROM escrow_transactions et JOIN cars c ON c.id=et.car_id
     WHERE et.id=$1 AND (et.buyer_id=$2 OR et.seller_id=$2)`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) throw new AppError('Transaction not found', 404);
  return ok(res, { transaction: rows[0] });
};

/* ══════════════════════════════════════════════
   BUYER — LIST MY ESCROWS
══════════════════════════════════════════════ */
exports.myEscrows = async (req, res) => {
  const { rows } = await query(
    `SELECT et.*, c.brand, c.model, c.year, c.photos[1] AS thumb
     FROM escrow_transactions et JOIN cars c ON c.id=et.car_id
     WHERE et.buyer_id=$1 ORDER BY et.created_at DESC`,
    [req.user.id]
  );
  return ok(res, { transactions: rows });
};

/* ══════════════════════════════════════════════
   SELLER — LIST MY PAYOUTS
══════════════════════════════════════════════ */
exports.myPayouts = async (req, res) => {
  const { rows } = await query(
    `SELECT et.*, c.brand, c.model, c.year
     FROM escrow_transactions et JOIN cars c ON c.id=et.car_id
     WHERE et.seller_id=$1 ORDER BY et.created_at DESC`,
    [req.user.id]
  );
  return ok(res, { transactions: rows });
};

/* ══════════════════════════════════════════════
   UPDATE DELIVERY STATUS (seller / admin)
══════════════════════════════════════════════ */
exports.updateDelivery = async (req, res) => {
  const { id } = req.params;
  const { deliveryStatus, eta } = req.body;
  const validStatuses = ['requested','dispatched','in_transit','delivered'];
  if (!validStatuses.includes(deliveryStatus))
    throw new AppError('Invalid delivery status', 400);

  await query(
    `UPDATE escrow_transactions
     SET delivery_status=$1, delivery_eta=$2, updated_at=NOW()
     WHERE id=$3 AND seller_id=$4`,
    [deliveryStatus, eta || null, id, req.user.id]
  );
  return ok(res, {}, 'Delivery status updated.');
};
