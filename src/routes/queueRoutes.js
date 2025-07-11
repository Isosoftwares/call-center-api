const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const {
  getQueues,
  createQueue,
  updateQueue,
  addAgentToQueue,
  removeAgentFromQueue,
  getQueueStats
} = require('../controllers/queueController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { USER_ROLES, QUEUE_STRATEGY } = require('../utils/constants');

// Validation rules
const createQueueValidation = [
  body('name').isLength({ min: 2 }).withMessage('Queue name is required'),
  body('strategy').isIn(Object.values(QUEUE_STRATEGY)).withMessage('Invalid queue strategy'),
  body('configuration.maxWaitTime').optional().isInt({ min: 0 }),
  body('configuration.maxQueueSize').optional().isInt({ min: 1 })
];

const addAgentValidation = [
  body('agentId').isString().withMessage('Agent ID is required'),
  body('weight').optional().isInt({ min: 1, max: 10 })
];

// Routes
router.get('/', authenticate, getQueues);
router.post('/', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), createQueueValidation, handleValidationErrors, createQueue);
router.put('/:queueId', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), updateQueue);
router.post('/:queueId/agents', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), addAgentValidation, handleValidationErrors, addAgentToQueue);
router.delete('/:queueId/agents/:agentId', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), removeAgentFromQueue);
router.get('/:queueId/stats', authenticate, getQueueStats);

module.exports = router;