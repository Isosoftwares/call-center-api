const Agent = require("../models/Agent");
const User = require("../models/User");
const {
  createSuccessResponse,
  createErrorResponse,
} = require("../utils/helpers");
const { AGENT_STATUS } = require("../utils/constants");
const { getRedisClient } = require("../config/redis");

// Get all agents
const getAgents = async (req, res) => {
  try {
    const { status, department, isOnline } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;

    let agents = await User.find(filter).sort({ createdAt: -1 });

    // Filter by department if specified
    if (department) {
      agents = agents.filter(
        (agent) => agent.userId.profile?.department === department
      );
    }

    res.status(200).json({ agents });
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get agent by ID
const getAgentById = async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = await Agent.findOne({ agentId }).populate(
      "userId",
      "username email profile"
    );

    if (!agent) {
      return res.status(404).json(createErrorResponse("Agent not found"));
    }

    res.json(createSuccessResponse(agent));
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Update agent status
const updateAgentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.user._id;

    let agent = await Agent.findOne({ userId });

    if (!agent) {
      // Create agent record if doesn't exist
      agent = new Agent({
        userId,
        agentId: `AGENT_${userId.toString().slice(-6).toUpperCase()}`,
        status,
      });
    } else {
      agent.status = status;
    }

    agent.availability.lastStatusChange = new Date();
    agent.availability.isOnline = status !== AGENT_STATUS.OFFLINE;

    await agent.save();

    // Update real-time status in Redis
    const redis = getRedisClient();
    await redis.setEx(
      `agent:${agent.agentId}:status`,
      3600,
      JSON.stringify({
        status,
        timestamp: new Date().toISOString(),
      })
    );

    res.json(createSuccessResponse(agent, "Agent status updated successfully"));
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Update agent skills
const updateAgentSkills = async (req, res) => {
  try {
    const { skills } = req.body;
    const userId = req.user._id;

    const agent = await Agent.findOneAndUpdate(
      { userId },
      { $set: { skills } },
      { new: true, upsert: true, runValidators: true }
    ).populate("userId", "username email profile");

    res.json(createSuccessResponse(agent, "Agent skills updated successfully"));
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get agent performance metrics
const getAgentPerformance = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { startDate, endDate } = req.query;

    const agent = await Agent.findOne({ agentId });
    if (!agent) {
      return res.status(404).json(createErrorResponse("Agent not found"));
    }

    // Get call statistics from Call model
    const Call = require("../models/Call");
    const filter = {
      "agentInfo.agentId": agent.userId,
      "callDetails.startTime": {},
    };

    if (startDate) filter["callDetails.startTime"].$gte = new Date(startDate);
    if (endDate) filter["callDetails.startTime"].$lte = new Date(endDate);

    const callStats = await Call.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalTalkTime: { $sum: "$callDetails.duration" },
          avgCallDuration: { $avg: "$callDetails.duration" },
          completedCalls: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
        },
      },
    ]);

    const performance = {
      ...agent.performance,
      periodStats: callStats[0] || {
        totalCalls: 0,
        totalTalkTime: 0,
        avgCallDuration: 0,
        completedCalls: 0,
      },
    };

    res.json(createSuccessResponse(performance));
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Set agent availability
const setAgentAvailability = async (req, res) => {
  try {
    const { isOnline, scheduledBreaks } = req.body;
    const userId = req.user._id;

    const agent = await Agent.findOneAndUpdate(
      { userId },
      {
        $set: {
          "availability.isOnline": isOnline,
          "availability.lastStatusChange": new Date(),
          "availability.scheduledBreaks": scheduledBreaks || [],
        },
      },
      { new: true, upsert: true }
    );

    res.json(
      createSuccessResponse(agent, "Agent availability updated successfully")
    );
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

module.exports = {
  getAgents,
  getAgentById,
  updateAgentStatus,
  updateAgentSkills,
  getAgentPerformance,
  setAgentAvailability,
};
