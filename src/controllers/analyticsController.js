const Call = require('../models/Call');
const Agent = require('../models/Agent');
const Queue = require('../models/Queue');
const { createSuccessResponse, createErrorResponse } = require('../utils/helpers');

// Get dashboard overview
const getDashboardOverview = async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    // Calculate time range
    const now = new Date();
    const periodMap = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    const startDate = new Date(now.getTime() - (periodMap[period] || periodMap['24h']));

    // Parallel data fetching
    const [callStats, agentStats, queueStats] = await Promise.all([
      // Call statistics
      Call.aggregate([
        {
          $match: { 'callDetails.startTime': { $gte: startDate } }
        },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            completedCalls: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            abandonedCalls: {
              $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] }
            },
            avgCallDuration: { $avg: '$callDetails.duration' },
            totalTalkTime: { $sum: '$callDetails.duration' },
            avgWaitTime: { $avg: '$queueInfo.queueTime' }
          }
        }
      ]),

      // Agent statistics
      Agent.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),

      // Queue statistics
      Call.aggregate([
        {
          $match: {
            status: 'queued',
            'callDetails.startTime': { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$queueInfo.queueId',
            queueSize: { $sum: 1 },
            avgWaitTime: { $avg: '$queueInfo.queueTime' }
          }
        }
      ])
    ]);

    // Format response
    const overview = {
      period,
      calls: callStats[0] || {
        totalCalls: 0,
        completedCalls: 0,
        abandonedCalls: 0,
        avgCallDuration: 0,
        totalTalkTime: 0,
        avgWaitTime: 0
      },
      agents: agentStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      queues: queueStats
    };

    // Calculate derived metrics
    overview.calls.completionRate = overview.calls.totalCalls > 0 
      ? (overview.calls.completedCalls / overview.calls.totalCalls) * 100 
      : 0;
    
    overview.calls.abandonmentRate = overview.calls.totalCalls > 0 
      ? (overview.calls.abandonedCalls / overview.calls.totalCalls) * 100 
      : 0;

    res.json(createSuccessResponse(overview));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get call volume trends
const getCallVolumeReport = async (req, res) => {
  try {
    const { period = '7d', interval = 'hour' } = req.query;
    
    const periodMap = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    
    const startDate = new Date(Date.now() - (periodMap[period] || periodMap['7d']));
    
    // Group by time interval
    const dateFormat = interval === 'hour' 
      ? { $dateToString: { format: "%Y-%m-%d %H:00", date: "$callDetails.startTime" } }
      : { $dateToString: { format: "%Y-%m-%d", date: "$callDetails.startTime" } };

    const volumeData = await Call.aggregate([
      {
        $match: { 'callDetails.startTime': { $gte: startDate } }
      },
      {
        $group: {
          _id: dateFormat,
          totalCalls: { $sum: 1 },
          inboundCalls: {
            $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] }
          },
          outboundCalls: {
            $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] }
          },
          completedCalls: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(createSuccessResponse({
      period,
      interval,
      data: volumeData
    }));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get agent performance report
const getAgentPerformanceReport = async (req, res) => {
  try {
    const { period = '30d', sortBy = 'totalCalls' } = req.query;
    
    const periodMap = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };
    
    const startDate = new Date(Date.now() - (periodMap[period] || periodMap['30d']));

    const performanceData = await Call.aggregate([
      {
        $match: {
          'callDetails.startTime': { $gte: startDate },
          'agentInfo.agentId': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$agentInfo.agentId',
          agentName: { $first: '$agentInfo.agentName' },
          totalCalls: { $sum: 1 },
          completedCalls: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          totalTalkTime: { $sum: '$callDetails.duration' },
          avgCallDuration: { $avg: '$callDetails.duration' },
          avgWaitTime: { $avg: '$queueInfo.queueTime' }
        }
      },
      {
        $addFields: {
          completionRate: {
            $cond: [
              { $eq: ['$totalCalls', 0] },
              0,
              { $multiply: [{ $divide: ['$completedCalls', '$totalCalls'] }, 100] }
            ]
          }
        }
      },
      { $sort: { [sortBy]: -1 } }
    ]);

    res.json(createSuccessResponse({
      period,
      sortBy,
      agents: performanceData
    }));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get queue performance report
const getQueuePerformanceReport = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    const periodMap = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };
    
    const startDate = new Date(Date.now() - (periodMap[period] || periodMap['30d']));

    const queueData = await Call.aggregate([
      {
        $match: {
          'callDetails.startTime': { $gte: startDate },
          'queueInfo.queueId': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$queueInfo.queueId',
          totalCalls: { $sum: 1 },
          completedCalls: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          abandonedCalls: {
            $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] }
          },
          avgWaitTime: { $avg: '$queueInfo.queueTime' },
          maxWaitTime: { $max: '$queueInfo.queueTime' },
          totalWaitTime: { $sum: '$queueInfo.queueTime' }
        }
      },
      {
        $addFields: {
          abandonmentRate: {
            $cond: [
              { $eq: ['$totalCalls', 0] },
              0,
              { $multiply: [{ $divide: ['$abandonedCalls', '$totalCalls'] }, 100] }
            ]
          },
          serviceLevel: {
            $cond: [
              { $eq: ['$totalCalls', 0] },
              0,
              { $multiply: [{ $divide: ['$completedCalls', '$totalCalls'] }, 100] }
            ]
          }
        }
      },
      { $sort: { totalCalls: -1 } }
    ]);

    res.json(createSuccessResponse({
      period,
      queues: queueData
    }));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Export call data
const exportCallData = async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    
    const filter = {};
    if (startDate) filter['callDetails.startTime'] = { $gte: new Date(startDate) };
    if (endDate) {
      filter['callDetails.startTime'] = filter['callDetails.startTime'] || {};
      filter['callDetails.startTime'].$lte = new Date(endDate);
    }

    const calls = await Call.find(filter)
      .populate('agentInfo.agentId', 'username profile')
      .sort({ 'callDetails.startTime': -1 })
      .limit(10000); // Limit for performance

    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(calls);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=calls-export.csv');
      res.send(csv);
    } else {
      res.json(createSuccessResponse(calls));
    }

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Helper function to convert to CSV
const convertToCSV = (calls) => {
  const headers = [
    'Call ID', 'Phone Number', 'Direction', 'Status', 'Start Time', 
    'End Time', 'Duration', 'Agent Name', 'Queue Time', 'Disposition'
  ];
  
  const rows = calls.map(call => [
    call.callId,
    call.phoneNumber,
    call.direction,
    call.status,
    call.callDetails.startTime,
    call.callDetails.endTime || '',
    call.callDetails.duration || 0,
    call.agentInfo?.agentName || '',
    call.queueInfo?.queueTime || 0,
    call.callDetails.disposition || ''
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
};

module.exports = {
  getDashboardOverview,
  getCallVolumeReport,
  getAgentPerformanceReport,
  getQueuePerformanceReport,
  exportCallData
};