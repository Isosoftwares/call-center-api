const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const {
  getPhoneNumbers,
  purchaseNumber,
  updatePhoneNumber,
  releasePhoneNumber,
  getPhoneNumberStats
} = require('../controllers/phoneNumberController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { USER_ROLES } = require('../utils/constants');

// Validation rules
const purchaseValidation = [
  body('areaCode').isLength({ min: 3, max: 3 }).withMessage('Area code must be 3 digits'),
  body('purpose').isString().withMessage('Purpose is required'),
  body('friendlyName').optional().isString()
];

const updateValidation = [
  param('phoneNumberId').isMongoId().withMessage('Valid phone number ID required'),
  body('friendlyName').optional().isString(),
  body('isActive').optional().isBoolean()
];

// Routes
router.get('/', authenticate, getPhoneNumbers);
router.post('/purchase', authenticate, authorize(USER_ROLES.ADMIN), purchaseValidation, handleValidationErrors, purchaseNumber);
router.put('/:phoneNumberId', authenticate, authorize(USER_ROLES.ADMIN), updateValidation, handleValidationErrors, updatePhoneNumber);
router.delete('/:phoneNumberId', authenticate, authorize(USER_ROLES.ADMIN), releasePhoneNumber);
router.get('/:phoneNumberId/stats', authenticate, getPhoneNumberStats);

module.exports = router;