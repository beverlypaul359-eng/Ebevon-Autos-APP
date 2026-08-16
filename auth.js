const router   = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const ctrl     = require('../controllers/authController');
const passport = require('passport');
const config   = require('../config');
const { signAccess, signRefresh } = require('../services/tokenService');

/* ── Signup ── */
router.post('/signup', authLimiter, [
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').optional().isIn(['buyer','seller']),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().isMobilePhone(),
], validate, ctrl.signup);

/* ── Login ── */
router.post('/login', authLimiter, [
  body('identifier').notEmpty().withMessage('Email or phone required'),
  body('password').notEmpty().withMessage('Password required'),
], validate, ctrl.login);

/* ── Refresh token ── */
router.post('/refresh', ctrl.refresh);

/* ── Logout ── */
router.post('/logout',      ctrl.logout);
router.post('/logout-all',  authenticate, ctrl.logoutAll);

/* ── Me ── */
router.get('/me', authenticate, ctrl.me);

/* ── Forgot / Reset password ── */
router.post('/forgot-password', authLimiter, [
  body('identifier').notEmpty(),
], validate, ctrl.forgotPassword);

router.post('/reset-password', authLimiter, [
  body('userId').isUUID(),
  body('newPassword').isLength({ min: 8 }),
], validate, ctrl.resetPassword);

/* ══════════════════════════════════════════════
   GOOGLE OAuth 2.0
══════════════════════════════════════════════ */
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${config.frontendUrl}/pages/login.html?error=oauth_failed` }),
  async (req, res) => {
    const user         = req.user;
    const accessToken  = signAccess(user);
    const refreshToken = await signRefresh(user, { ip: req.ip, deviceInfo: req.headers['user-agent'] });
    res.cookie('ebevon_rt', refreshToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh',
    });
    res.redirect(`${config.frontendUrl}/pages/dashboard-buyer.html?token=${accessToken}`);
  }
);

/* ══════════════════════════════════════════════
   FACEBOOK OAuth 2.0
══════════════════════════════════════════════ */
router.get('/facebook',
  passport.authenticate('facebook', { scope: ['email'], session: false })
);

router.get('/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: `${config.frontendUrl}/pages/login.html?error=oauth_failed` }),
  async (req, res) => {
    const user         = req.user;
    const accessToken  = signAccess(user);
    const refreshToken = await signRefresh(user, { ip: req.ip, deviceInfo: req.headers['user-agent'] });
    res.cookie('ebevon_rt', refreshToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh',
    });
    res.redirect(`${config.frontendUrl}/pages/dashboard-buyer.html?token=${accessToken}`);
  }
);

module.exports = router;
