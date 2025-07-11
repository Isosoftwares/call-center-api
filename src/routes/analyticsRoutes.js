const express = require('express');
const router = express.Router();

const {
  getDashboardOverview,
  getCallVolumeReport,
  getAgentPerformanceReport,
  getQueuePerformanceReport,
  exportCallData
} = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../utils/constants');

// Routes
router.get('/dashboard', authenticate, getDashboardOverview);
router.get('/call-volume', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), getCallVolumeReport);
router.get('/agent-performance', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), getAgentPerformanceReport);
router.get('/queue-performance', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), getQueuePerformanceReport);
router.get('/export-calls', authenticate, authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), exportCallData);

module.exports = router;
