const router   = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, requireSeller } = require('../middleware/auth');
const ctrl     = require('../controllers/escrowController');

router.post('/',              authenticate, [body('carId').isUUID()], validate, ctrl.initiateEscrow);
router.get('/mine',           authenticate, ctrl.myEscrows);
router.get('/payouts',        authenticate, requireSeller, ctrl.myPayouts);
router.get('/:id',            authenticate, ctrl.getEscrow);
router.post('/:id/confirm',   authenticate, ctrl.confirmReceipt);
router.post('/:id/dispute',   authenticate, [body('reason').notEmpty()], validate, ctrl.raiseDispute);
router.patch('/:id/delivery', authenticate, requireSeller, ctrl.updateDelivery);

module.exports = router;
