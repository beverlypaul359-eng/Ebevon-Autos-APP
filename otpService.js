const crypto       = require('crypto');
const nodemailer   = require('nodemailer');
const config       = require('../config');
const { query }    = require('../db/pool');
const AppError     = require('../utils/AppError');
const logger       = require('../utils/logger');

/* ── Twilio client (lazy init so app starts without valid creds) ── */
let twilioClient;
const getTwilio = () => {
  if (!twilioClient) twilioClient = require('twilio')(config.twilio.accountSid, config.twilio.authToken);
  return twilioClient;
};

/* ── SMTP transporter ── */
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
});

/* ── Generate a 6-digit OTP ── */
const generateCode = () => String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, '0');

/* ══════════════════════════════════════════════
   SEND OTP
   channel: 'email' | 'phone'
   purpose: 'signup' | 'login' | 'password_reset' | 'phone_verify' | 'email_verify'
══════════════════════════════════════════════ */
const sendOtp = async (userId, target, channel, purpose) => {
  const code      = generateCode();
  const expiresAt = new Date(Date.now() + config.otp.expiresMinutes * 60 * 1000);

  // Invalidate any previous unused OTPs for this target+purpose
  await query(
    `UPDATE otp_codes SET used_at=NOW() WHERE target=$1 AND purpose=$2 AND used_at IS NULL`,
    [target, purpose]
  );

  await query(
    `INSERT INTO otp_codes (user_id, target, code, purpose, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, target, code, purpose, expiresAt]
  );

  const templates = {
    signup:         { subject: 'Verify your EBEVON account',   body: `Your EBEVON verification code is: ${code}\n\nExpires in ${config.otp.expiresMinutes} minutes.` },
    login:          { subject: 'EBEVON login OTP',             body: `Your one-time login code is: ${code}\n\nExpires in ${config.otp.expiresMinutes} minutes.` },
    password_reset: { subject: 'EBEVON password reset code',   body: `Your password reset code is: ${code}\n\nExpires in ${config.otp.expiresMinutes} minutes.` },
    email_verify:   { subject: 'Verify your email – EBEVON',   body: `Verify your email with code: ${code}` },
    phone_verify:   { subject: 'EBEVON phone verification',    body: `Your EBEVON phone code: ${code}` },
  };

  const tmpl = templates[purpose] || templates.signup;

  if (channel === 'email') {
    try {
      await transporter.sendMail({
        from: config.smtp.from,
        to:   target,
        subject: tmpl.subject,
        text:    tmpl.body,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;background:#111;color:#f0f0f0;border-radius:12px">
            <img src="https://ebevon.com/assets/images/logo.jpg" alt="EBEVON" style="height:40px;margin-bottom:24px"/>
            <h2 style="color:#c9a84c">${tmpl.subject}</h2>
            <p style="font-size:14px;color:#aaa">Use the code below to continue:</p>
            <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#c9a84c;margin:24px 0;text-align:center">
              ${code}
            </div>
            <p style="font-size:13px;color:#666">This code expires in <strong>${config.otp.expiresMinutes} minutes</strong>.<br/>Do not share this code with anyone.</p>
            <p style="font-size:12px;color:#444;margin-top:24px">© 2026 EBEVON · Nigeria's Trusted Car Marketplace</p>
          </div>
        `,
      });
    } catch (err) {
      logger.error(`Failed to send email OTP to ${target}: ${err.message}`);
    }
  } else {
    // SMS via Twilio
    try {
      await getTwilio().messages.create({
        body: `EBEVON: Your verification code is ${code}. Expires in ${config.otp.expiresMinutes} mins. Do not share.`,
        from: config.twilio.from,
        to:   target,
      });
    } catch (err) {
      logger.error(`Failed to send SMS OTP to ${target}: ${err.message}`);
    }
  }

  logger.info(`OTP sent [${channel}] to ${target} for ${purpose}`);
  return code; // returned only in dev/test
};

/* ══════════════════════════════════════════════
   VERIFY OTP
══════════════════════════════════════════════ */
const verifyOtp = async (target, code, purpose) => {
  const { rows } = await query(
    `SELECT * FROM otp_codes
     WHERE target=$1 AND purpose=$2 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [target, purpose]
  );

  if (!rows.length) throw new AppError('OTP not found or expired', 400, 'OTP_EXPIRED');

  const record = rows[0];

  // Brute-force protection — max 5 attempts
  if (record.attempts >= 5) {
    await query(`UPDATE otp_codes SET used_at=NOW() WHERE id=$1`, [record.id]);
    throw new AppError('Too many attempts. Request a new code.', 429, 'OTP_MAX_ATTEMPTS');
  }

  if (record.code !== code) {
    await query(`UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1`, [record.id]);
    throw new AppError(`Invalid code. ${4 - record.attempts} attempt(s) remaining.`, 400, 'OTP_INVALID');
  }

  // Mark as used
  await query(`UPDATE otp_codes SET used_at=NOW() WHERE id=$1`, [record.id]);
  return record.user_id;
};

module.exports = { sendOtp, verifyOtp };
