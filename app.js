require('dotenv').config();
require('express-async-errors');

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const compression  = require('compression');
const passport     = require('passport');

const config       = require('./config');
const logger       = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Routes
const authRoutes     = require('./routes/auth');
const otpRoutes      = require('./routes/otp');
const passkeyRoutes  = require('./routes/passkey');
const kycRoutes      = require('./routes/kyc');
const carRoutes      = require('./routes/cars');
const escrowRoutes   = require('./routes/escrow');
const userRoutes     = require('./routes/users');
const inspectionRoutes = require('./routes/inspection');
const webhookRoutes  = require('./routes/webhooks');

// Passport strategies
require('./services/passport');

const app = express();

// ─── TRUST PROXY (for Heroku/Render etc.) ───────
app.set('trust proxy', 1);

// ─── SECURITY HEADERS ───────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ─── CORS ───────────────────────────────────────
app.use(cors({
  origin:      config.frontendUrl,
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── STRIPE WEBHOOK (raw body before json parser) ──
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/api/webhooks', webhookRoutes);

// ─── BODY PARSING ───────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.cookie.secret));
app.use(compression());

// ─── LOGGING ────────────────────────────────────
if (config.env !== 'test') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// ─── PASSPORT ───────────────────────────────────
app.use(passport.initialize());

// ─── RATE LIMITING ──────────────────────────────
app.use('/api/', apiLimiter);

// ─── HEALTH CHECK ───────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', env: config.env }));

// ─── API ROUTES ─────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/otp',      otpRoutes);
app.use('/api/passkey',  passkeyRoutes);
app.use('/api/kyc',      kycRoutes);
app.use('/api/cars',     carRoutes);
app.use('/api/escrow',      escrowRoutes);
app.use('/api/inspection', inspectionRoutes);
app.use('/api/users',    userRoutes);

// ─── 404 ─────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// ─── ERROR HANDLER ───────────────────────────────
app.use(errorHandler);

// ─── START ───────────────────────────────────────
app.listen(config.port, () => {
  logger.info(`🚀 EBEVON API running on port ${config.port} [${config.env}]`);
});

module.exports = app;
