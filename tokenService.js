const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { query } = require('../db/pool');

/** Sign a short-lived access token */
const signAccess = (user) =>
  jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

/** Sign a long-lived refresh token and persist its hash */
const signRefresh = async (user, meta = {}) => {
  const token = jwt.sign({ sub: user.id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpires,
  });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [user.id, tokenHash, meta.deviceInfo || null, meta.ip || null, expiresAt]
  );

  return token;
};

/** Verify refresh token, return user_id, revoke old token */
const rotateRefresh = async (token, meta = {}) => {
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.refreshSecret);
  } catch {
    throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await query(
    `SELECT * FROM refresh_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  if (!rows.length) throw Object.assign(new Error('Refresh token reuse detected'), { statusCode: 401 });

  // Revoke used token (rotation)
  await query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1`, [tokenHash]);

  return payload.sub;
};

/** Revoke all refresh tokens for a user (logout all devices) */
const revokeAll = (userId) =>
  query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);

module.exports = { signAccess, signRefresh, rotateRefresh, revokeAll };
