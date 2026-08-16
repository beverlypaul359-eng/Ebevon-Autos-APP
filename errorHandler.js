const logger   = require('../utils/logger');
const AppError = require('../utils/AppError');

const errorHandler = (err, req, res, next) => {
  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: err.errors });
  }

  // Postgres unique violation
  if (err.code === '23505') {
    const field = err.detail?.match(/\((.+?)\)/)?.[1] || 'field';
    return res.status(409).json({ success: false, message: `${field} already exists.` });
  }

  // Known operational errors
  if (err.isOperational) {
    return res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
  }

  // Unknown errors — don't leak details in production
  logger.error(err);
  const msg = process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message;
  return res.status(500).json({ success: false, message: msg });
};

module.exports = errorHandler;
