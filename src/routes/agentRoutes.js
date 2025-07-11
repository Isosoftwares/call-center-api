const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const {
  getAgents,
  getAgentById,
  updateAgentStatus,
  updateAgentSkills,
  getAgentPerformance,
  setAgentAvailability
} = require('../controllers/agentController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { USER_ROLES, AGENT_STATUS } = require('../utils/constants');

// Validation rules
const updateStatusValidation = [
  body('status').isIn(Object.values(AGENT_STATUS)).withMessage('Invalid agent status')
];

const updateSkillsValidation = [
  body('skills').isArray().withMessage('Skills must be an array'),
  body('skills.*.skill').isString().withMessage('Skill name must be a string'),
  body('skills.*.level').isInt({ min: 1, max: 5 }).withMessage('Skill level must be 1-5')
];

const availabilityValidation = [
  body('isOnline').isBoolean().withMessage('isOnline must be boolean'),
  body('scheduledBreaks').optional().isArray()
];

// Routes
router.get('/', getAgents);
router.get('/:agentId', getAgentById);
router.put('/status', updateAgentStatus);
router.put('/skills', authenticate, updateSkillsValidation, handleValidationErrors, updateAgentSkills);
router.get('/:agentId/performance', authenticate, getAgentPerformance);
router.put('/availability', authenticate, availabilityValidation, handleValidationErrors, setAgentAvailability);

module.exports = router;