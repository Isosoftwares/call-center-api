const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const {
  getUserNotifications,
  markNotificationAsRead,
  sendSystemNotification,
  getNotificationSettings,
  updateNotificationSettings
} = require('../controllers/notificationController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { USER_ROLES } = require('../utils/constants');

// Validation rules
const sendNotificationValidation = [
  body('message').isString().isLength({ min: 1 }).withMessage('Message is required'),
  body('recipients').isArray().withMessage('Recipients must be an array'),
  body('priority').optional().isIn(['low', 'normal', 'high']).withMessage('Invalid priority')
];

// Routes
router.get('/', authenticate, getUserNotifications);
router.put('/:notificationId/read', authenticate, markNotificationAsRead);
router.post('/send', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), sendNotificationValidation, handleValidationErrors, sendSystemNotification);
router.get('/settings', authenticate, getNotificationSettings);
router.put('/settings', authenticate, updateNotificationSettings);

module.exports = router;