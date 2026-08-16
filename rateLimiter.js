const rateLimit = require('express-rate-limit');

const make = (windowMs, max, message) =>
  rateLimit({ windowMs, max, message: { success: false, message }, standardHeaders: true, legacyHeaders: false });

module.exports = {
  // Strict: auth endpoints
  authLimiter:    make(15 * 60 * 1000, 10,  'Too many auth attempts. Try again in 15 minutes.'),
  // OTP requests
  otpLimiter:     make(5  * 60 * 1000, 5,   'Too many OTP requests. Wait 5 minutes.'),
  // General API
  apiLimiter:     make(60 * 1000,      120, 'Too many requests. Slow down.'),
  // Passkey / WebAuthn
  passkeyLimiter: make(5  * 60 * 1000, 20,  'Too many passkey requests.'),
};
