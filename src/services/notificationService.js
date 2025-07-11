const { getRedisClient } = require('../config/redis');
const { broadcastSystemMessage, notifyAgentOfIncomingCall } = require('../websocket/socketHandlers');
const logger = require('../utils/logger');

// Notification types
const NOTIFICATION_TYPES = {
  INCOMING_CALL: 'incoming_call',
  CALL_MISSED: 'call_missed',
  SYSTEM_ALERT: 'system_alert',
  QUEUE_UPDATE: 'queue_update',
  PERFORMANCE_ALERT: 'performance_alert'
};

// Create notification
const createNotification = async (recipientId, type, data, priority = 'normal') => {
  const redis = getRedisClient();
  
  const notification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    data,
    priority,
    timestamp: new Date().toISOString(),
    read: false
  };

  try {
    // Store in Redis
    await redis.lPush(`notifications:${recipientId}`, JSON.stringify(notification));
    await redis.lTrim(`notifications:${recipientId}`, 0, 99); // Keep last 100

    // Send real-time notification based on type
    switch (type) {
      case NOTIFICATION_TYPES.INCOMING_CALL:
        notifyAgentOfIncomingCall(recipientId, data);
        break;
      case NOTIFICATION_TYPES.SYSTEM_ALERT:
        broadcastSystemMessage(data.message, [data.targetRole || 'agent']);
        break;
      default:
        // Generic notification
        break;
    }

    logger.info('Notification created', { recipientId, type, notificationId: notification.id });
    return notification;

  } catch (error) {
    logger.error('Failed to create notification:', error);
    throw error;
  }
};

// Bulk notification
const createBulkNotification = async (recipientIds, type, data, priority = 'normal') => {
  const notifications = [];
  
  for (const recipientId of recipientIds) {
    try {
      const notification = await createNotification(recipientId, type, data, priority);
      notifications.push(notification);
    } catch (error) {
      logger.error(`Failed to create notification for ${recipientId}:`, error);
    }
  }
  
  return notifications;
};

// Performance alert system
const checkPerformanceAlerts = async () => {
  const redis = getRedisClient();
  
  try {
    // Get current metrics
    const metricsData = await redis.get('realtime:metrics');
    if (!metricsData) return;
    
    const metrics = JSON.parse(metricsData);
    const alerts = [];

    // Check queue length alert
    if (metrics.calls.queuedCalls > 10) {
      alerts.push({
        type: 'HIGH_QUEUE_LENGTH',
        message: `High queue length: ${metrics.calls.queuedCalls} calls waiting`,
        priority: 'high',
        data: { queueLength: metrics.calls.queuedCalls }
      });
    }

    // Check average wait time alert
    if (metrics.calls.avgWaitTime > 120) { // 2 minutes
      alerts.push({
        type: 'HIGH_WAIT_TIME',
        message: `High average wait time: ${Math.round(metrics.calls.avgWaitTime)} seconds`,
        priority: 'medium',
        data: { avgWaitTime: metrics.calls.avgWaitTime }
      });
    }

    // Check agent availability
    const totalAgents = Object.values(metrics.agents).reduce((sum, count) => sum + count, 0);
    const availableAgents = metrics.agents.available || 0;
    const availabilityRate = totalAgents > 0 ? availableAgents / totalAgents : 0;

    if (availabilityRate < 0.3) { // Less than 30% available
      alerts.push({
        type: 'LOW_AGENT_AVAILABILITY',
        message: `Low agent availability: ${availableAgents}/${totalAgents} agents available`,
        priority: 'high',
        data: { availableAgents, totalAgents, availabilityRate }
      });
    }

    // Send alerts to supervisors and admins
    if (alerts.length > 0) {
      const Agent = require('../models/Agent');
      const User = require('../models/User');
      
      const supervisors = await User.find({ 
        role: { $in: ['admin', 'supervisor'] } 
      }).select('_id');
      
      const supervisorIds = supervisors.map(s => s._id.toString());

      for (const alert of alerts) {
        await createBulkNotification(
          supervisorIds, 
          NOTIFICATION_TYPES.PERFORMANCE_ALERT, 
          alert, 
          alert.priority
        );
      }
    }

    return alerts;

  } catch (error) {
    logger.error('Error checking performance alerts:', error);
    throw error;
  }
};

// Schedule periodic alert checks
const startPerformanceMonitoring = () => {
  // Check every 2 minutes
  setInterval(checkPerformanceAlerts, 2 * 60 * 1000);
  logger.info('Performance monitoring started');
};

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  createBulkNotification,
  checkPerformanceAlerts,
  startPerformanceMonitoring
};