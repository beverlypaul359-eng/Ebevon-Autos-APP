const argon2   = require('argon2');
const { query, withTransaction } = require('../db/pool');
const { signAccess, signRefresh, rotateRefresh, revokeAll } = require('../services/tokenService');
const { sendOtp } = require('../services/otpService');
const { ok, created, fail } = require('../utils/respond');
const AppError = require('../utils/AppError');

/* ─── helpers ─── */
const safeUser = (u) => ({
  id: u.id, email: u.email, phone: u.phone,
  firstName: u.first_name, lastName: u.last_name,
  role: u.role, status: u.status, kycStatus: u.kyc_status,
  emailVerified: u.email_verified, phoneVerified: u.phone_verified,
  dealershipName: u.dealership_name, isDealer: u.is_dealer,
  passkeyRegistered: u.passkey_registered,
});

const setRefreshCookie = (res, token) =>
  res.cookie('ebevon_rt', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh',
  });

/* ══════════════════════════════════════════════
   SIGNUP
══════════════════════════════════════════════ */
exports.signup = async (req, res) => {
  const { email, phone, firstName, lastName, password, role,
          state, dealershipName, cacNumber } = req.body;

  // At least one contact method required
  if (!email && !phone) throw new AppError('Email or phone number is required', 400);

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const { rows } = await withTransaction(async (client) => {
    return client.query(
      `INSERT INTO users
         (email, phone, first_name, last_name, password_hash, role, status,
          state, dealership_name, cac_number, is_dealer)
       VALUES ($1,$2,$3,$4,$5,$6,'pending_otp',$7,$8,$9,$10)
       RETURNING *`,
      [
        email || null, phone || null, firstName, lastName, passwordHash,
        role || 'buyer', state || null,
        dealershipName || null, cacNumber || null,
        !!(dealershipName),
      ]
    );
  });

  const user = rows[0];

  // Send OTP to whichever contact method was provided
  if (email) await sendOtp(user.id, email, 'email', 'signup');
  else       await sendOtp(user.id, phone, 'phone', 'signup');

  return created(res, { userId: user.id }, 'Account created. Please verify your OTP to continue.');
};

/* ══════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════ */
exports.login = async (req, res) => {
  const { identifier, password } = req.body; // identifier = email OR phone

  const { rows } = await query(
    `SELECT * FROM users WHERE email=$1 OR phone=$1 LIMIT 1`,
    [identifier]
  );
  if (!rows.length) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const user = rows[0];

  if (!user.password_hash) {
    throw new AppError('This account uses social login. Please sign in with Google or Facebook.', 400, 'OAUTH_ONLY');
  }

  const valid = await argon2.verify(user.password_hash, password);
  if (!valid) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  if (user.status === 'pending_otp') {
    // Re-send OTP
    const target = user.email || user.phone;
    const channel = user.email ? 'email' : 'phone';
    await sendOtp(user.id, target, channel, 'login');
    throw new AppError('Account not verified. A new OTP has been sent.', 403, 'OTP_REQUIRED');
  }

  if (user.status === 'suspended') throw new AppError('Account suspended', 403, 'SUSPENDED');
  if (user.status === 'banned')    throw new AppError('Account banned', 403, 'BANNED');

  await query(`UPDATE users SET last_login_at=NOW() WHERE id=$1`, [user.id]);

  const accessToken  = signAccess(user);
  const refreshToken = await signRefresh(user, {
    ip: req.ip, deviceInfo: req.headers['user-agent'],
  });

  setRefreshCookie(res, refreshToken);
  return ok(res, { accessToken, user: safeUser(user) }, 'Login successful');
};

/* ══════════════════════════════════════════════
   REFRESH TOKEN
══════════════════════════════════════════════ */
exports.refresh = async (req, res) => {
  const token = req.cookies?.ebevon_rt || req.body?.refreshToken;
  if (!token) throw new AppError('Refresh token required', 401);

  const userId = await rotateRefresh(token, { ip: req.ip, deviceInfo: req.headers['user-agent'] });

  const { rows } = await query('SELECT * FROM users WHERE id=$1', [userId]);
  if (!rows.length) throw new AppError('User not found', 401);

  const user         = rows[0];
  const accessToken  = signAccess(user);
  const refreshToken = await signRefresh(user, { ip: req.ip, deviceInfo: req.headers['user-agent'] });

  setRefreshCookie(res, refreshToken);
  return ok(res, { accessToken, user: safeUser(user) });
};

/* ══════════════════════════════════════════════
   LOGOUT
══════════════════════════════════════════════ */
exports.logout = async (req, res) => {
  const token = req.cookies?.ebevon_rt || req.body?.refreshToken;
  if (token) {
    const crypto   = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1`, [tokenHash]);
  }
  res.clearCookie('ebevon_rt', { path: '/api/auth/refresh' });
  return ok(res, {}, 'Logged out');
};

/* ══════════════════════════════════════════════
   LOGOUT ALL DEVICES
══════════════════════════════════════════════ */
exports.logoutAll = async (req, res) => {
  await revokeAll(req.user.id);
  res.clearCookie('ebevon_rt', { path: '/api/auth/refresh' });
  return ok(res, {}, 'Logged out from all devices');
};

/* ══════════════════════════════════════════════
   ME (current user)
══════════════════════════════════════════════ */
exports.me = async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  return ok(res, { user: safeUser(rows[0]) });
};

/* ══════════════════════════════════════════════
   FORGOT PASSWORD
══════════════════════════════════════════════ */
exports.forgotPassword = async (req, res) => {
  const { identifier } = req.body;
  const { rows } = await query(
    `SELECT * FROM users WHERE email=$1 OR phone=$1 LIMIT 1`, [identifier]
  );
  // Always respond OK to prevent user enumeration
  if (rows.length) {
    const user    = rows[0];
    const target  = user.email || user.phone;
    const channel = user.email ? 'email' : 'phone';
    await sendOtp(user.id, target, channel, 'password_reset');
  }
  return ok(res, {}, 'If an account exists, a reset code has been sent.');
};

/* ══════════════════════════════════════════════
   RESET PASSWORD (after OTP verified)
══════════════════════════════════════════════ */
exports.resetPassword = async (req, res) => {
  const { userId, newPassword } = req.body;
  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await query(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`, [passwordHash, userId]);
  await revokeAll(userId);
  return ok(res, {}, 'Password reset successful. Please log in.');
};
