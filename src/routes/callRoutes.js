const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const {
  createCall,
  getCallHistory,
  getActiveCalls,
  updateCallStatus,
  terminateCall,
  addComment
} = require('../controllers/callController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { USER_ROLES } = require('../utils/constants');

// Validation rules
const createCallValidation = [
  body('phoneNumber').isMobilePhone().withMessage('Valid phone number required'),
  body('customerId').optional().isString(),
  body('priority').optional().isInt({ min: 0, max: 10 })
];

const updateCallValidation = [
  param('callId').isUUID().withMessage('Valid call ID required'),
  body('status').isIn(['in-progress', 'completed', 'failed']).withMessage('Invalid status'),
  body('disposition').optional().isString(),
  body('notes').optional().isString()
];

// Routes
router.post('/', authenticate, createCallValidation, handleValidationErrors, createCall);
router.post('/add-comment', addComment);
router.get('/history', authenticate, getCallHistory);
router.get('/active', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), getActiveCalls);
router.patch('/:callId', authenticate, updateCallValidation, handleValidationErrors, updateCallStatus);
router.delete('/:callId', authenticate, terminateCall);

module.exports = router;
