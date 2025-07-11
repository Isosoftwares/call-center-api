const Call = require('../models/Call');
const Agent = require('../models/Agent');
const { getRedisClient } = require('../config/redis');
const { pipe, curry } = require('../utils/helpers');

// Real-time metrics calculation
const calculateRealTimeMetrics = async () => {
  const redis = getRedisClient();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  try {
    // Get today's call statistics
    const todayStats = await Call.aggregate([
      {
        $match: {
          'callDetails.startTime': { $gte: startOfDay }
        }
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          activeCalls: {
            $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] }
          },
          queuedCalls: {
            $sum: { $cond: [{ $eq: ['$status', 'queued'] }, 1, 0] }
          },
          completedCalls: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          avgWaitTime: { $avg: '$queueInfo.queueTime' },
          totalTalkTime: { $sum: '$callDetails.duration' }
        }
      }
    ]);

    // Get agent availability
    const agentStats = await Agent.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const metrics = {
      timestamp: now.toISOString(),
      calls: todayStats[0] || {
        totalCalls: 0,
        activeCalls: 0,
        queuedCalls: 0,
        completedCalls: 0,
        avgWaitTime: 0,
        totalTalkTime: 0
      },
      agents: agentStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    };

    // Cache metrics for 30 seconds
    await redis.setEx('realtime:metrics', 30, JSON.stringify(metrics));
    
    return metrics;

  } catch (error) {
    console.error('Error calculating real-time metrics:', error);
    throw error;
  }
};

// Performance benchmarking
const generatePerformanceBenchmarks = async (period = '30d') => {
  const periodMap = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
  };
  
  const startDate = new Date(Date.now() - (periodMap[period] || periodMap['30d']));

  const benchmarks = await Call.aggregate([
    {
      $match: {
        'callDetails.startTime': { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        // Service Level Agreement metrics
        answeredWithin20s: {
          $sum: { $cond: [{ $lte: ['$queueInfo.queueTime', 20] }, 1, 0] }
        },
        answeredWithin60s: {
          $sum: { $cond: [{ $lte: ['$queueInfo.queueTime', 60] }, 1, 0] }
        },
        totalAnswered: { $sum: 1 },
        
        // Call quality metrics
        avgHandleTime: { $avg: '$callDetails.duration' },
        maxHandleTime: { $max: '$callDetails.duration' },
        minHandleTime: { $min: '$callDetails.duration' },
        
        // Wait time metrics
        avgWaitTime: { $avg: '$queueInfo.queueTime' },
        maxWaitTime: { $max: '$queueInfo.queueTime' },
        
        // Volume metrics
        totalCalls: { $sum: 1 },
        peakCallDuration: { $max: '$callDetails.duration' }
      }
    },
    {
      $addFields: {
        serviceLevel20s: {
          $multiply: [
            { $divide: ['$answeredWithin20s', '$totalAnswered'] },
            100
          ]
        },
        serviceLevel60s: {
          $multiply: [
            { $divide: ['$answeredWithin60s', '$totalAnswered'] },
            100
          ]
        }
      }
    }
  ]);

  return benchmarks[0] || {};
};

// Call pattern analysis
const analyzeCallPatterns = async () => {
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Hourly call pattern
  const hourlyPattern = await Call.aggregate([
    {
      $match: {
        'callDetails.startTime': { $gte: last30Days }
      }
    },
    {
      $group: {
        _id: { $hour: '$callDetails.startTime' },
        callCount: { $sum: 1 },
        avgDuration: { $avg: '$callDetails.duration' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Daily call pattern
  const dailyPattern = await Call.aggregate([
    {
      $match: {
        'callDetails.startTime': { $gte: last30Days }
      }
    },
    {
      $group: {
        _id: { $dayOfWeek: '$callDetails.startTime' },
        callCount: { $sum: 1 },
        avgDuration: { $avg: '$callDetails.duration' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return {
    hourlyPattern,
    dailyPattern,
    analysisDate: now.toISOString(),
    period: '30 days'
  };
};

// Predictive analytics for staffing
const predictStaffingNeeds = async () => {
  const redis = getRedisClient();
  
  try {
    // Get historical data for last 4 weeks
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    
    const historicalData = await Call.aggregate([
      {
        $match: {
          'callDetails.startTime': { $gte: fourWeeksAgo }
        }
      },
      {
        $group: {
          _id: {
            dayOfWeek: { $dayOfWeek: '$callDetails.startTime' },
            hour: { $hour: '$callDetails.startTime' }
          },
          avgCallVolume: { $avg: 1 },
          avgHandleTime: { $avg: '$callDetails.duration' },
          callCount: { $sum: 1 }
        }
      }
    ]);

    // Simple staffing calculation based on call volume and handle time
    const staffingPredictions = historicalData.map(data => {
      const { dayOfWeek, hour } = data._id;
      const estimatedCallsPerHour = data.callCount / 4; // 4 weeks of data
      const avgHandleTimeMinutes = data.avgHandleTime / 60;
      
      // Erlang C calculation (simplified)
      const targetServiceLevel = 0.8; // 80% of calls answered within threshold
      const targetAnswerTime = 20; // seconds
      
      // Basic staffing calculation
      const workloadHours = (estimatedCallsPerHour * avgHandleTimeMinutes) / 60;
      const suggestedAgents = Math.ceil(workloadHours * 1.2); // 20% buffer
      
      return {
        dayOfWeek,
        hour,
        estimatedCalls: Math.round(estimatedCallsPerHour),
        suggestedAgents,
        workloadHours: Math.round(workloadHours * 100) / 100
      };
    });

    // Cache predictions for 1 hour
    await redis.setEx('staffing:predictions', 3600, JSON.stringify(staffingPredictions));
    
    return staffingPredictions;

  } catch (error) {
    console.error('Error predicting staffing needs:', error);
    throw error;
  }
};

module.exports = {
  calculateRealTimeMetrics,
  generatePerformanceBenchmarks,
  analyzeCallPatterns,
  predictStaffingNeeds
};
