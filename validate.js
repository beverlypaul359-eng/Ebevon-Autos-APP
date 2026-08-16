const { validationResult } = require('express-validator');

/** Run express-validator and throw if errors exist */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation failed');
    err.type   = 'validation';
    err.errors = errors.array();
    return next(err);
  }
  next();
};

module.exports = validate;
