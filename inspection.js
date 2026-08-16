const router   = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl     = require('../controllers/inspectionController');

/* ── Buyer routes ── */

// Request an inspection for a car listing
router.post('/', authenticate, [
  body('carId').isUUID().withMessage('Valid car ID required'),
  body('contactName').trim().notEmpty().withMessage('Contact name required'),
  body('contactPhone').trim().notEmpty().withMessage('Contact phone required'),
  body('preferredDate1').optional().isDate().withMessage('Invalid date format (YYYY-MM-DD)'),
  body('preferredDate2').optional().isDate(),
  body('inspectionAddress').optional().trim(),
  body('inspectionState').optional().trim(),
  body('buyerNotes').optional().trim().isLength({ max: 1000 }),
  body('escrowId').optional().isUUID(),
], validate, ctrl.requestInspection);

// Get buyer's own inspection requests
router.get('/mine', authenticate, ctrl.myRequests);

// Get single request (buyer sees their own; admin sees all)
router.get('/:id', authenticate, ctrl.getRequest);

// Cancel a pending/scheduled request
router.post('/:id/cancel', authenticate, ctrl.cancelRequest);

/* ── Admin routes ── */

// List all inspection requests
router.get('/', authenticate, requireAdmin, ctrl.adminListRequests);

// Schedule an inspection (assign date + inspector)
router.patch('/:id/schedule', authenticate, requireAdmin, [
  body('scheduledAt').isISO8601().withMessage('Valid datetime required'),
  body('inspectorName').optional().trim(),
  body('assignedTo').optional().isUUID(),
  body('adminNotes').optional().trim(),
], validate, ctrl.scheduleInspection);

// Submit completed inspection report
router.patch('/:id/report', authenticate, requireAdmin, [
  body('inspectorNotes').notEmpty().withMessage('Inspector notes required'),
  body('overallGrade').isIn(['A','B','C','D','F']).withMessage('Grade must be A–F'),
  body('passed').isBoolean(),
  body('reportUrl').optional().isURL(),
  body('inspectedAt').optional().isISO8601(),
], validate, ctrl.submitReport);

// Stats
router.get('/stats/overview', authenticate, requireAdmin, ctrl.getStats);

module.exports = router;
