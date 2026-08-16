const router = require('express').Router();
const { authenticate, requireSeller } = require('../middleware/auth');
const { createInquiry, getInquiryStatus } = require('../services/personaService');
const { ok } = require('../utils/respond');

/* ── Start KYC — creates Persona inquiry and returns hosted URL ── */
router.post('/start', authenticate, async (req, res) => {
  const result = await createInquiry(req.user.id);
  return ok(res, result, 'KYC inquiry created. Complete verification in the provided URL.');
});

/* ── Poll status manually ── */
router.get('/status', authenticate, async (req, res) => {
  const result = await getInquiryStatus(req.user.id);
  return ok(res, result);
});

module.exports = router;
