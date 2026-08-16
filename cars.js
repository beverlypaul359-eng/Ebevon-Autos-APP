const router   = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, requireSeller, requireKYC } = require('../middleware/auth');
const ctrl     = require('../controllers/carsController');

/* ── Public ── */
router.get('/',    ctrl.getListings);
router.get('/:id', ctrl.getListing);

/* ── Authenticated buyer actions ── */
router.post('/:id/save',   authenticate, ctrl.saveCar);
router.delete('/:id/save', authenticate, ctrl.unsaveCar);
router.get('/me/saved',    authenticate, ctrl.savedCars);

/* ── Seller ── */
router.get('/me/listings', authenticate, requireSeller, ctrl.myListings);

router.post('/', authenticate, requireSeller, requireKYC, [
  body('brand').notEmpty().withMessage('Brand is required'),
  body('model').notEmpty().withMessage('Model is required'),
  body('year').isInt({ min: 1980, max: new Date().getFullYear() + 1 }).withMessage('Valid year required'),
  body('condition').isIn(['brand_new','foreign_used','nigerian_used']).withMessage('Valid condition required'),
  body('priceNgn').isInt({ min: 100000 }).withMessage('Price must be at least ₦100,000'),
  body('vin')
    .notEmpty().withMessage('VIN is required for vehicle verification')
    .isLength({ min: 17, max: 17 }).withMessage('VIN must be exactly 17 characters')
    .matches(/^[A-HJ-NPR-Z0-9]{17}$/i).withMessage('VIN contains invalid characters (no I, O, or Q allowed)'),
], validate, ctrl.createListing);

/* ── VIN verify + publish gate — kept for re-verification if needed (admin only) ── */

router.patch('/:id', authenticate, requireSeller, ctrl.updateListing);
router.delete('/:id', authenticate, requireSeller, ctrl.deleteListing);

module.exports = router;
