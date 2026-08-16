const router   = require('express').Router();
const { body } = require('express-validator');
const argon2   = require('argon2');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { query } = require('../db/pool');
const { ok }    = require('../utils/respond');
const AppError  = require('../utils/AppError');

/* ── Get profile ── */
router.get('/me', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT id,email,phone,first_name,last_name,role,status,kyc_status,
            email_verified,phone_verified,avatar_url,state,
            dealership_name,cac_number,is_dealer,passkey_registered,
            last_login_at,created_at
     FROM users WHERE id=$1`, [req.user.id]
  );
  return ok(res, { user: rows[0] });
});

/* ── Update profile ── */
router.patch('/me', authenticate, [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('state').optional().trim(),
  body('dealershipName').optional().trim(),
  body('cacNumber').optional().trim(),
], validate, async (req, res) => {
  const { firstName, lastName, state, dealershipName, cacNumber } = req.body;
  const { rows } = await query(
    `UPDATE users SET
       first_name=COALESCE($1,first_name),
       last_name=COALESCE($2,last_name),
       state=COALESCE($3,state),
       dealership_name=COALESCE($4,dealership_name),
       cac_number=COALESCE($5,cac_number),
       is_dealer=CASE WHEN $4 IS NOT NULL THEN TRUE ELSE is_dealer END,
       updated_at=NOW()
     WHERE id=$6 RETURNING id,email,first_name,last_name,role,status`,
    [firstName||null, lastName||null, state||null, dealershipName||null, cacNumber||null, req.user.id]
  );
  return ok(res, { user: rows[0] });
});

/* ── Change password ── */
router.patch('/me/password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], validate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { rows } = await query(`SELECT password_hash FROM users WHERE id=$1`, [req.user.id]);
  if (!rows[0].password_hash) throw new AppError('Social login accounts cannot set a password here', 400);
  const valid = await argon2.verify(rows[0].password_hash, currentPassword);
  if (!valid) throw new AppError('Current password is incorrect', 400);
  const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await query(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`, [hash, req.user.id]);
  return ok(res, {}, 'Password updated.');
});

/* ── Notifications ── */
router.get('/notifications', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]
  );
  return ok(res, { notifications: rows });
});

router.patch('/notifications/:id/read', authenticate, async (req, res) => {
  await query(`UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
  return ok(res, {});
});

router.patch('/notifications/read-all', authenticate, async (req, res) => {
  await query(`UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`, [req.user.id]);
  return ok(res, {});
});

module.exports = router;
