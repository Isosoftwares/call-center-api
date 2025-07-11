const express = require('express');
const router = express.Router();
const softPhoneController = require('../controllers/softPhoneController');

 router.post('/softphone/token', softPhoneController.getAccessToken);
  
  // Call handling
  router.post('/incoming', softPhoneController.handleIncomingCall);
  router.post('/outbound', softPhoneController.handleOutboundCall);
  router.post('/dial-status', softPhoneController.handleDialStatus);
  router.post('/outbound-status', softPhoneController.handleOutboundStatus);
  router.post('/outbound-bridge', softPhoneController.handleOutboundBridge);
  
  // Queue management
  router.post('/queue-status', softPhoneController.handleQueueStatus);
  router.post('/hold-music', softPhoneController.handleHoldMusic);
  
  // Status and monitoring
  router.post('/status', softPhoneController.handleCallStatus);
  router.get('/agents/:agentId/status', softPhoneController.getAgentStatus);
  
  // Outbound call initiation
  router.post('/initiate', softPhoneController.initiateOutboundCall);

  module.exports = router;
