const Queue = require('../models/Queue');
const Call = require('../models/Call');
const Agent = require('../models/Agent');
const { createSuccessResponse, createErrorResponse } = require('../utils/helpers');
const { QUEUE_STRATEGY, CALL_STATUS } = require('../utils/constants');

// Get all queues
const getQueues = async (req, res) => {
  try {
    const queues = await Queue.find({ isActive: true })
      .populate('agents.agentId', 'userId agentId status')
      .sort({ name: 1 });

    // Add current queue sizes
    const queuesWithStats = await Promise.all(
      queues.map(async (queue) => {
        const currentSize = await Call.countDocuments({
          'queueInfo.queueId': queue.queueId,
          status: CALL_STATUS.QUEUED
        });

        return {
          ...queue.toObject(),
          currentSize
        };
      })
    );

    res.json(createSuccessResponse(queuesWithStats));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Create new queue
const createQueue = async (req, res) => {
  try {
    const { name, description, strategy, configuration } = req.body;

    const queueId = `QUEUE_${Date.now()}`;
    
    const queue = new Queue({
      queueId,
      name,
      description,
      strategy,
      configuration
    });

    await queue.save();

    res.status(201).json(createSuccessResponse(queue, 'Queue created successfully'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Update queue configuration
const updateQueue = async (req, res) => {
  try {
    const { queueId } = req.params;
    const updates = req.body;

    const queue = await Queue.findOneAndUpdate(
      { queueId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!queue) {
      return res.status(404).json(createErrorResponse('Queue not found'));
    }

    res.json(createSuccessResponse(queue, 'Queue updated successfully'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Add agent to queue
const addAgentToQueue = async (req, res) => {
  try {
    const { queueId } = req.params;
    const { agentId, weight = 1 } = req.body;

    // Verify agent exists
    const agent = await Agent.findOne({ agentId });
    if (!agent) {
      return res.status(404).json(createErrorResponse('Agent not found'));
    }

    const queue = await Queue.findOneAndUpdate(
      { queueId },
      {
        $addToSet: {
          agents: {
            agentId: agent._id,
            weight,
            addedAt: new Date()
          }
        }
      },
      { new: true }
    ).populate('agents.agentId', 'userId agentId status');

    if (!queue) {
      return res.status(404).json(createErrorResponse('Queue not found'));
    }

    res.json(createSuccessResponse(queue, 'Agent added to queue successfully'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Remove agent from queue
const removeAgentFromQueue = async (req, res) => {
  try {
    const { queueId, agentId } = req.params;

    const agent = await Agent.findOne({ agentId });
    if (!agent) {
      return res.status(404).json(createErrorResponse('Agent not found'));
    }

    const queue = await Queue.findOneAndUpdate(
      { queueId },
      {
        $pull: {
          agents: { agentId: agent._id }
        }
      },
      { new: true }
    ).populate('agents.agentId', 'userId agentId status');

    if (!queue) {
      return res.status(404).json(createErrorResponse('Queue not found'));
    }

    res.json(createSuccessResponse(queue, 'Agent removed from queue successfully'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get queue statistics
const getQueueStats = async (req, res) => {
  try {
    const { queueId } = req.params;
    const { period = '24h' } = req.query;

    // Calculate time range
    const now = new Date();
    const timeRanges = {
      '1h': new Date(now.getTime() - 60 * 60 * 1000),
      '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    };

    const startTime = timeRanges[period] || timeRanges['24h'];

    const stats = await Call.aggregate([
      {
        $match: {
          'queueInfo.queueId': queueId,
          'callDetails.startTime': { $gte: startTime }
        }
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          avgWaitTime: { $avg: '$queueInfo.queueTime' },
          maxWaitTime: { $max: '$queueInfo.queueTime' },
          completedCalls: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          abandonedCalls: {
            $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] }
          }
        }
      }
    ]);

    const queueStats = stats[0] || {
      totalCalls: 0,
      avgWaitTime: 0,
      maxWaitTime: 0,
      completedCalls: 0,
      abandonedCalls: 0
    };

    // Calculate abandonment rate
    queueStats.abandonmentRate = queueStats.totalCalls > 0 
      ? (queueStats.abandonedCalls / queueStats.totalCalls) * 100 
      : 0;

    // Get current queue size
    queueStats.currentQueueSize = await Call.countDocuments({
      'queueInfo.queueId': queueId,
      status: CALL_STATUS.QUEUED
    });

    res.json(createSuccessResponse(queueStats));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

module.exports = {
  getQueues,
  createQueue,
  updateQueue,
  addAgentToQueue,
  removeAgentFromQueue,
  getQueueStats
};