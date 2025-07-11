const { createSuccessResponse, createErrorResponse } = require('../utils/helpers');
const { getRedisClient } = require('../config/redis');
const { broadcastSystemMessage } = require('../websocket/socketHandlers');

// Get user notifications
const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const redis = getRedisClient();
    
    // Get notifications from Redis
    const notifications = await redis.lRange(`notifications:${userId}`, 0, 49); // Last 50
    
    const parsedNotifications = notifications.map(n => JSON.parse(n));

    res.json(createSuccessResponse(parsedNotifications));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Mark notification as read
const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id.toString();
    const redis = getRedisClient();
    
    // Update notification in Redis
    await redis.sAdd(`read_notifications:${userId}`, notificationId);

    res.json(createSuccessResponse(null, 'Notification marked as read'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Send system notification
const sendSystemNotification = async (req, res) => {
  try {
    const { message, recipients, priority = 'normal' } = req.body;
    
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'system',
      message,
      priority,
      timestamp: new Date().toISOString(),
      sender: req.user.username
    };

    const redis = getRedisClient();

    // Store notification for each recipient
    for (const recipientId of recipients) {
      await redis.lPush(`notifications:${recipientId}`, JSON.stringify(notification));
      // Keep only last 100 notifications
      await redis.lTrim(`notifications:${recipientId}`, 0, 99);
    }

    // Broadcast via WebSocket
    broadcastSystemMessage(message, ['admin', 'supervisor', 'agent']);

    res.json(createSuccessResponse(notification, 'Notification sent successfully'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get notification settings
const getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const redis = getRedisClient();
    
    const settings = await redis.get(`notification_settings:${userId}`);
    
    const defaultSettings = {
      incomingCalls: true,
      queueUpdates: true,
      systemMessages: true,
      emailNotifications: false,
      soundAlerts: true
    };

    const userSettings = settings ? JSON.parse(settings) : defaultSettings;

    res.json(createSuccessResponse(userSettings));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Update notification settings
const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const settings = req.body;
    const redis = getRedisClient();
    
    await redis.set(`notification_settings:${userId}`, JSON.stringify(settings));

    res.json(createSuccessResponse(settings, 'Notification settings updated'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

module.exports = {
  getUserNotifications,
  markNotificationAsRead,
  sendSystemNotification,
  getNotificationSettings,
  updateNotificationSettings
};