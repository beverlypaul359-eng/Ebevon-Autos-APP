const axios    = require('axios');
const crypto   = require('crypto');
const config   = require('../config');
const { query }= require('../db/pool');
const AppError = require('../utils/AppError');
const logger   = require('../utils/logger');

const personaApi = axios.create({
  baseURL: config.persona.apiUrl,
  headers: {
    'Authorization':  `Bearer ${config.persona.apiKey}`,
    'Persona-Version': '2023-01-05',
    'Content-Type':   'application/json',
    'Accept':         'application/json',
  },
});

/* ══════════════════════════════════════════════
   CREATE INQUIRY
   Returns a hosted session URL the front-end opens
   in an iframe / new window.
══════════════════════════════════════════════ */
const createInquiry = async (userId) => {
  const { rows } = await query(
    `SELECT id, email, phone, first_name, last_name, kyc_inquiry_id FROM users WHERE id=$1`, [userId]
  );
  if (!rows.length) throw new AppError('User not found', 404);
  const user = rows[0];

  // Re-use existing inquiry if already created
  if (user.kyc_inquiry_id) {
    // Resume existing inquiry
    try {
      const resp = await personaApi.post(`/inquiries/${user.kyc_inquiry_id}/resume`);
      return {
        inquiryId:  user.kyc_inquiry_id,
        sessionUrl: resp.data?.data?.attributes?.['session-token']
          ? `https://withpersona.com/verify?inquiry-id=${user.kyc_inquiry_id}&session-token=${resp.data.data.attributes['session-token']}`
          : null,
      };
    } catch {
      // If resume fails, fall through to create new
    }
  }

  const payload = {
    data: {
      attributes: {
        'inquiry-template-id': config.persona.templateId,
        'reference-id':        userId,
        fields: {
          'name-first': { value: user.first_name },
          'name-last':  { value: user.last_name },
          'email-address': { value: user.email || '' },
          'phone-number':  { value: user.phone || '' },
        },
      },
    },
  };

  const resp = await personaApi.post('/inquiries', payload);
  const inquiry   = resp.data?.data;
  const inquiryId = inquiry?.id;
  const sessionToken = inquiry?.attributes?.['session-token'];

  if (!inquiryId) throw new AppError('Failed to create KYC inquiry', 500, 'PERSONA_ERROR');

  // Persist inquiry ID
  await query(
    `UPDATE users SET kyc_inquiry_id=$1, kyc_status='pending', updated_at=NOW() WHERE id=$2`,
    [inquiryId, userId]
  );

  const sessionUrl = sessionToken
    ? `https://withpersona.com/verify?inquiry-id=${inquiryId}&session-token=${sessionToken}`
    : `https://withpersona.com/verify?inquiry-id=${inquiryId}`;

  logger.info(`Persona inquiry created: ${inquiryId} for user ${userId}`);
  return { inquiryId, sessionUrl };
};

/* ══════════════════════════════════════════════
   GET INQUIRY STATUS (manual poll)
══════════════════════════════════════════════ */
const getInquiryStatus = async (userId) => {
  const { rows } = await query(
    `SELECT kyc_inquiry_id, kyc_status FROM users WHERE id=$1`, [userId]
  );
  if (!rows.length || !rows[0].kyc_inquiry_id)
    throw new AppError('No KYC inquiry found', 404);

  const resp = await personaApi.get(`/inquiries/${rows[0].kyc_inquiry_id}`);
  const status = resp.data?.data?.attributes?.status;

  const mapped = mapPersonaStatus(status);
  await query(
    `UPDATE users SET kyc_status=$1, kyc_approved_at=$2, updated_at=NOW() WHERE id=$3`,
    [mapped, mapped === 'approved' ? new Date() : null, userId]
  );

  return { inquiryId: rows[0].kyc_inquiry_id, status: mapped, rawStatus: status };
};

/* ══════════════════════════════════════════════
   WEBHOOK HANDLER
   Called from POST /api/webhooks/persona
══════════════════════════════════════════════ */
const handleWebhook = async (rawBody, signature) => {
  // Verify webhook signature
  const expected = crypto
    .createHmac('sha256', config.persona.webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (signature !== `sha256=${expected}`)
    throw new AppError('Invalid webhook signature', 401);

  const event    = JSON.parse(rawBody);
  const eventType= event?.data?.type || event?.name;
  const inquiry  = event?.data?.attributes || event?.payload?.data?.attributes;
  const inquiryId= event?.data?.id || event?.payload?.data?.id;

  logger.info(`Persona webhook: ${eventType} — ${inquiryId}`);

  if (!inquiryId) return;

  const kycStatus = mapPersonaStatus(inquiry?.status || eventType);

  const { rows } = await query(
    `UPDATE users SET kyc_status=$1, kyc_approved_at=$2, updated_at=NOW()
     WHERE kyc_inquiry_id=$3 RETURNING id`,
    [kycStatus, kycStatus === 'approved' ? new Date() : null, inquiryId]
  );

  if (rows.length) {
    logger.info(`KYC status updated to '${kycStatus}' for user ${rows[0].id}`);
  }
};

const mapPersonaStatus = (status = '') => {
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('completed')) return 'approved';
  if (s.includes('declined') || s.includes('failed'))    return 'declined';
  if (s.includes('review'))                              return 'needs_review';
  if (s.includes('expired') || s.includes('canceled'))  return 'declined';
  return 'pending';
};

module.exports = { createInquiry, getInquiryStatus, handleWebhook };
