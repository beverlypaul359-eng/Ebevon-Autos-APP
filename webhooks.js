const router  = require('express').Router();
const Stripe  = require('stripe');
const config  = require('../config');
const { query } = require('../db/pool');
const { handleWebhook: personaWebhook } = require('../services/personaService');
const logger  = require('../utils/logger');

/* ══════════════════════════════════════════════
   STRIPE WEBHOOK
   Note: body is raw Buffer (set in app.js before json parser)
══════════════════════════════════════════════ */
router.post('/stripe', async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const stripe = config.stripe.secretKey ? Stripe(config.stripe.secretKey) : null;

  if (!stripe) return res.sendStatus(200);

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    logger.error(`Stripe webhook signature failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info(`Stripe event: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      await query(
        `UPDATE escrow_transactions SET status='funded', updated_at=NOW()
         WHERE stripe_payment_intent_id=$1`,
        [pi.id]
      );
      logger.info(`Escrow funded: PaymentIntent ${pi.id}`);
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      // Revert car to live
      await query(
        `UPDATE cars c SET status='live', updated_at=NOW()
         FROM escrow_transactions et
         WHERE et.stripe_payment_intent_id=$1 AND et.car_id=c.id`,
        [pi.id]
      );
      await query(
        `UPDATE escrow_transactions SET status='refunded', updated_at=NOW()
         WHERE stripe_payment_intent_id=$1`,
        [pi.id]
      );
      logger.warn(`Payment failed, escrow voided: ${pi.id}`);
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      logger.info(`Charge refunded: ${charge.id}`);
      break;
    }
  }

  res.sendStatus(200);
});

/* ══════════════════════════════════════════════
   PERSONA WEBHOOK
══════════════════════════════════════════════ */
router.post('/persona', express_raw_or_text, async (req, res) => {
  try {
    const rawBody  = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const sig      = req.headers['persona-signature'] || req.headers['x-persona-signature'] || '';
    await personaWebhook(rawBody, sig);
    res.sendStatus(200);
  } catch (err) {
    logger.error(`Persona webhook error: ${err.message}`);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Persona sends JSON — we need raw text for HMAC verification
function express_raw_or_text(req, res, next) {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    req.body = Buffer.concat(chunks).toString('utf8');
    next();
  });
}

module.exports = router;
