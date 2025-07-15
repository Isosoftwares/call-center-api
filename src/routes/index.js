const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./authRoutes');
const callRoutes = require('./callRoutes');
const agentRoutes = require('./agentRoutes');
const queueRoutes = require('./queueRoutes');
const phoneNumberRoutes = require('./phoneNumberRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const notificationRoutes = require('./notificationRoutes');
const webhookRoutes = require('./webhookRoutes');
const softPhoneRoutes = require('./softPhoneRoutes');
const categoryRoutes = require('./categoryRoutes');
const schoolRoutes = require('./schoolRoutes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/record-calls', callRoutes);
router.use('/agents', agentRoutes);
router.use('/queues', queueRoutes);
router.use('/phone-numbers', phoneNumberRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/categories', categoryRoutes);
router.use('/schools', schoolRoutes);

// Webhook routes (no auth required)
router.use('/webhooks', webhookRoutes);
router.use('/calls', softPhoneRoutes);

module.exports = router;