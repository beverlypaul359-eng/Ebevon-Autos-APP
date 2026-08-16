const router   = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { otpLimiter } = require('../middleware/rateLimiter');
const { sendOtp, verifyOtp } = require('../services/otpService');
const { signAccess, signRefresh } = require('../services/tokenService');
const { query } = require('../db/pool');
const { ok }    = require('../utils/respond');
const AppError  = require('../utils/AppError');

/* ── Resend OTP ── */
router.post('/send', otpLimiter, [
  body('target').notEmpty().withMessage('Email or phone required'),
  body('purpose').isIn(['signup','login','password_reset','email_verify','phone_verify']),
], validate, async (req, res) => {
  const { target, purpose } = req.body;

  const { rows } = await query(
    `SELECT id FROM users WHERE email=$1 OR phone=$1 LIMIT 1`, [target]
  );
  if (!rows.length) {
    // Return OK to prevent user enumeration
    return ok(res, {}, 'OTP sent if account exists.');
  }

  const channel = target.includes('@') ? 'email' : 'phone';
  await sendOtp(rows[0].id, target, channel, purpose);
  return ok(res, {}, 'OTP sent successfully.');
});

/* ── Verify OTP (signup / login / reset) ── */
router.post('/verify', otpLimiter, [
  body('target').notEmpty(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
  body('purpose').isIn(['signup','login','password_reset','email_verify','phone_verify']),
], validate, async (req, res) => {
  const { target, code, purpose } = req.body;
  const channel  = target.includes('@') ? 'email' : 'phone';

  const userId = await verifyOtp(target, code, purpose);

  // Mark appropriate verified flag
  const field = channel === 'email' ? 'email_verified' : 'phone_verified';
  await query(
    `UPDATE users SET ${field}=TRUE, status='active', updated_at=NOW() WHERE id=$1`, [userId]
  );

  // Fetch user and issue tokens
  const { rows } = await query('SELECT * FROM users WHERE id=$1', [userId]);
  const user = rows[0];

  const accessToken  = signAccess(user);
  const refreshToken = await signRefresh(user, { ip: req.ip, deviceInfo: req.headers['user-agent'] });

  res.cookie('ebevon_rt', refreshToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh',
  });

  return ok(res, {
    accessToken,
    user: { id: user.id, email: user.email, phone: user.phone,
            firstName: user.first_name, lastName: user.last_name,
            role: user.role, status: user.status, kycStatus: user.kyc_status },
  }, 'Verification successful.');
});

module.exports = router;
