const router = require('express').Router();
const { passkeyLimiter } = require('../middleware/rateLimiter');
const { authenticate }   = require('../middleware/auth');
const { signAccess, signRefresh } = require('../services/tokenService');
const { query } = require('../db/pool');
const {
  startRegistration, finishRegistration,
  startAuthentication, finishAuthentication,
} = require('../services/passkeyService');
const { ok } = require('../utils/respond');

/* ── Registration ── */
router.post('/register/start', passkeyLimiter, authenticate, async (req, res) => {
  const options = await startRegistration(req.user);
  return ok(res, { options });
});

router.post('/register/finish', passkeyLimiter, authenticate, async (req, res) => {
  const { body, friendlyName } = req.body;
  await finishRegistration(req.user.id, body, friendlyName);
  return ok(res, {}, 'Passkey registered successfully.');
});

/* ── Authentication (no token needed) ── */
router.post('/auth/start', passkeyLimiter, async (req, res) => {
  const { identifier } = req.body;
  const { options, userId } = await startAuthentication(identifier);
  return ok(res, { options, userId });
});

router.post('/auth/finish', passkeyLimiter, async (req, res) => {
  const { userId, body } = req.body;
  await finishAuthentication(userId, body);

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
    user: { id: user.id, email: user.email, firstName: user.first_name, role: user.role },
  }, 'Passkey authentication successful.');
});

/* ── List / Delete passkeys ── */
router.get('/', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT id, credential_id, friendly_name, device_type, backed_up, created_at, last_used_at
     FROM passkeys WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  return ok(res, { passkeys: rows });
});

router.delete('/:id', authenticate, async (req, res) => {
  await query(`DELETE FROM passkeys WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
  return ok(res, {}, 'Passkey removed.');
});

module.exports = router;
