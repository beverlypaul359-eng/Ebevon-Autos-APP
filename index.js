require('dotenv').config();

module.exports = {
  env:         process.env.NODE_ENV || 'development',
  port:        parseInt(process.env.PORT, 10) || 4000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',

  db: { url: process.env.DATABASE_URL },

  jwt: {
    secret:         process.env.JWT_SECRET,
    refreshSecret:  process.env.JWT_REFRESH_SECRET,
    expiresIn:      process.env.JWT_EXPIRES_IN      || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  otp: { expiresMinutes: parseInt(process.env.OTP_EXPIRES_MINUTES, 10) || 10 },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken:  process.env.TWILIO_AUTH_TOKEN,
    from:       process.env.TWILIO_PHONE_NUMBER,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM,
  },

  google: {
    clientId:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl:  process.env.GOOGLE_CALLBACK_URL,
  },

  facebook: {
    appId:       process.env.FACEBOOK_APP_ID,
    appSecret:   process.env.FACEBOOK_APP_SECRET,
    callbackUrl: process.env.FACEBOOK_CALLBACK_URL,
  },

  webauthn: {
    rpName:  process.env.RP_NAME   || 'EBEVON',
    rpId:    process.env.RP_ID     || 'localhost',
    origin:  process.env.WEBAUTHN_ORIGIN || 'http://localhost:8080',
  },

  persona: {
    apiKey:         process.env.PERSONA_API_KEY,
    templateId:     process.env.PERSONA_TEMPLATE_ID,
    webhookSecret:  process.env.PERSONA_WEBHOOK_SECRET,
    apiUrl:         process.env.PERSONA_API_URL || 'https://withpersona.com/api/v1',
  },

  nhtsa: { apiUrl: process.env.NHTSA_API_URL || 'https://vpic.nhtsa.dot.gov/api/vehicles' },

  stripe: {
    secretKey:      process.env.STRIPE_SECRET_KEY,
    webhookSecret:  process.env.STRIPE_WEBHOOK_SECRET,
  },

  cookie: { secret: process.env.COOKIE_SECRET },
};
