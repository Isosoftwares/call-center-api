const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getRedisClient } = require("../config/redis");

let io;

// Redis keys
const REDIS_KEYS = {
  AVAILABLE_AGENTS: "agents:available",
  AGENT_STATUS: (agentId) => `agent:${agentId}:status`,
  AGENT_CALLS: (agentId) => `agent:${agentId}:calls`,
  AGENTS_ON_CALL: "agents:on-call",
  ROUND_ROBIN_COUNTER: "agents:round-robin:counter",
  AGENT_LAST_ASSIGNED: (agentId) => `agent:${agentId}:last-assigned`,
};

// Agent management functions
const addAgentToRedis = async (agentId, agentData = {}) => {
  try {
    const redis = getRedisClient();

    // Use pipeline for atomic operations
    const pipeline = redis.multi();

    // Add to available agents set
    pipeline.sAdd(REDIS_KEYS.AVAILABLE_AGENTS, agentId);

    // Set agent status
    pipeline.hSet(REDIS_KEYS.AGENT_STATUS(agentId), {
      status: "available",
      connectedAt: new Date().toISOString(),
      socketId: agentData.socketId || "",
      ...agentData,
    });

    // Initialize call count
    pipeline.hSet(REDIS_KEYS.AGENT_CALLS(agentId), {
      currentCalls: "0",
      totalCalls: "0",
    });

    // Set last assigned timestamp
    pipeline.set(REDIS_KEYS.AGENT_LAST_ASSIGNED(agentId), Date.now());

    await pipeline.exec();

    console.log(`Agent ${agentId} added to Redis`);
    return true;
  } catch (error) {
    console.error(`Error adding agent ${agentId} to Redis:`, error);
    return false;
  }
};

const removeAgentFromRedis = async (agentId) => {
  try {
    const redis = getRedisClient();

    // Use pipeline for atomic operations
    const pipeline = redis.multi();

    // Remove from all sets
    pipeline.sRem(REDIS_KEYS.AVAILABLE_AGENTS, agentId);
    pipeline.sRem(REDIS_KEYS.AGENTS_ON_CALL, agentId);

    // Delete agent data
    pipeline.del(REDIS_KEYS.AGENT_STATUS(agentId));
    pipeline.del(REDIS_KEYS.AGENT_CALLS(agentId));
    pipeline.del(REDIS_KEYS.AGENT_LAST_ASSIGNED(agentId));

    await pipeline.exec();

    console.log(`Agent ${agentId} removed from Redis`);
    return true;
  } catch (error) {
    console.error(`Error removing agent ${agentId} from Redis:`, error);
    return false;
  }
};

const getAvailableAgentsFromRedis = async () => {
  try {
    const redis = getRedisClient();

    // Get available agents who are not currently on a call
    const availableAgents = await redis.sDiff([
      REDIS_KEYS.AVAILABLE_AGENTS,
      REDIS_KEYS.AGENTS_ON_CALL,
    ]);

    console.log(`Available agents: ${availableAgents}`);

    if (!availableAgents.length) {
      return [];
    }

    // Get detailed information for each agent
    const agentDetails = await Promise.all(
      availableAgents.map(async (agentId) => {
        const [status, calls, lastAssigned] = await Promise.all([
          redis.hGetAll(REDIS_KEYS.AGENT_STATUS(agentId)),
          redis.hGetAll(REDIS_KEYS.AGENT_CALLS(agentId)),
          redis.get(REDIS_KEYS.AGENT_LAST_ASSIGNED(agentId)),
        ]);

        return {
          agentId,
          status: status.status || "available",
          currentCalls: parseInt(calls.currentCalls || "0"),
          totalCalls: parseInt(calls.totalCalls || "0"),
          lastAssigned: parseInt(lastAssigned || "0"),
          connectedAt: status.connectedAt,
          socketId: status.socketId,
        };
      })
    );

    console.log("agent details", agentDetails);

    // Filter out agents with invalid status
    return agentDetails.filter((agent) => agent.status === "available");
  } catch (error) {
    console.error("Error getting available agents from Redis:", error);
    return [];
  }
};

const selectAgentForCall = async () => {
  try {
    const availableAgents = await getAvailableAgentsFromRedis();

    console.log(availableAgents, "inside select agent for a call")

    if (!availableAgents.length) {
      return null;
    }

    // Sort by total calls (ascending) then by last assigned time (ascending)
    // This ensures fair distribution
    availableAgents.sort((a, b) => {
      if (a.totalCalls !== b.totalCalls) {
        return a.totalCalls - b.totalCalls;
      }
      return a.lastAssigned - b.lastAssigned;
    });

    return availableAgents[0];
  } catch (error) {
    console.error("Error selecting agent for call:", error);
    return null;
  }
};

const assignCallToAgent = async (agentId, callData) => {
  try {
    const redis = getRedisClient();

    // Use WATCH for optimistic locking to prevent race conditions
    await redis.watch(REDIS_KEYS.AGENT_CALLS(agentId));

    // Check if agent is still available
    const isAvailable = await redis.sIsMember(
      REDIS_KEYS.AVAILABLE_AGENTS,
      agentId
    );
    const isOnCall = await redis.sIsMember(REDIS_KEYS.AGENTS_ON_CALL, agentId);

    if (!isAvailable || isOnCall) {
      await redis.unwatch();
      return { success: false, reason: "Agent no longer available" };
    }

    // Start transaction
    const pipeline = redis.multi();

    // Move agent to on-call set
    pipeline.sAdd(REDIS_KEYS.AGENTS_ON_CALL, agentId);

    // Update agent status
    pipeline.hSet(REDIS_KEYS.AGENT_STATUS(agentId), {
      status: "busy",
      currentCall: callData.callId || "",
      callStartTime: new Date().toISOString(),
    });

    // Increment call counts
    pipeline.hIncrBy(REDIS_KEYS.AGENT_CALLS(agentId), "currentCalls", 1);
    pipeline.hIncrBy(REDIS_KEYS.AGENT_CALLS(agentId), "totalCalls", 1);

    // Update last assigned time
    pipeline.set(REDIS_KEYS.AGENT_LAST_ASSIGNED(agentId), Date.now());

    const results = await pipeline.exec();

    if (results === null) {
      // Transaction was discarded due to WATCH
      return { success: false, reason: "Concurrent modification detected" };
    }

    console.log(`Call ${callData.callId} assigned to agent ${agentId}`);
    return { success: true, agentId };
  } catch (error) {
    console.error("Error assigning call to agent:", error);
    return { success: false, reason: error.message };
  }
};

const releaseAgentFromCall = async (agentId) => {
  if (!agentId) {
    console.error("❌ releaseAgentFromCall: agentId is required");
    return false;
  }

  console.log("agent to be released", agentId);

  try {
    const redis = getRedisClient();

    const pipeline = redis.multi();

    // Remove from on-call set
    pipeline.sRem(REDIS_KEYS.AGENTS_ON_CALL, agentId);

    // Update agent status
    pipeline.hSet(REDIS_KEYS.AGENT_STATUS(agentId), {
      status: "available",
      currentCall: "",
      callEndTime: new Date().toISOString(),
    });

    // Decrement current calls
    pipeline.hIncrBy(REDIS_KEYS.AGENT_CALLS(agentId), "currentCalls", -1);

    const results = await pipeline.exec();

    console.log(
      `✅ Agent ${agentId} released from call. Redis results:`,
      results
    );

    return true;
  } catch (error) {
    console.error(`❌ Error releasing agent ${agentId} from call:`, error);
    return false;
  }
};

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return next(new Error("Authentication error"));
    }

    socket.userId = user._id.toString();
    socket.userRole = user.role;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
};

// Initialize Socket.IO
const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use(authenticateSocket);

  io.on("connection", async (socket) => {
    console.log(`User ${socket.userRole} connected: ${socket.userId}`);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);

    // Join role-based rooms
    socket.join(`role:${socket.userRole}`);

    await addAgentToRedis(socket.userId, {
      socketId: socket.id,
      userRole: "agent",
    });

    // Broadcast agent availability update
    socket.to("role:supervisor").to("role:admin").emit("agent:connected", {
      agentId: socket.userId,
      timestamp: new Date().toISOString(),
    });

    // Handle agent status updates
    socket.on("agent:status-update", async (data) => {
      try {
        const { status } = data;
        const redis = getRedisClient();

        // Update Redis status
        await redis.hSet(REDIS_KEYS.AGENT_STATUS(socket.userId), {
          status,
          timestamp: new Date().toISOString(),
        });

        // If agent goes offline, remove from available set
        if (status === "offline") {
          await redis.sRem(REDIS_KEYS.AVAILABLE_AGENTS, socket.userId);
        } else if (status === "available") {
          await redis.sAdd(REDIS_KEYS.AVAILABLE_AGENTS, socket.userId);
        }

        // Broadcast to supervisors
        socket
          .to("role:supervisor")
          .to("role:admin")
          .emit("agent:status-changed", {
            userId: socket.userId,
            status,
            timestamp: new Date().toISOString(),
          });
      } catch (error) {
        socket.emit("error", { message: "Failed to update status" });
      }
    });

    // Handle call events
    socket.on("call:join", (callId) => {
      socket.join(`call:${callId}`);
    });

    socket.on("call:leave", (callId) => {
      socket.leave(`call:${callId}`);
    });

    // Handle call end - release agent
    socket.on("call:ended", async (data) => {
      if (socket.userRole === "agent") {
        await releaseAgentFromCall(socket.userId, data);

        // Broadcast agent availability
        socket.to("role:supervisor").to("role:admin").emit("agent:available", {
          agentId: socket.userId,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`User ${socket.userId} disconnected`);

      // If user is an agent, remove from Redis
      if (socket.userRole === "agent") {
        await removeAgentFromRedis(socket.userId.toString());

        // Broadcast agent disconnection
        socket
          .to("role:supervisor")
          .to("role:admin")
          .emit("agent:disconnected", {
            agentId: socket.userId,
            timestamp: new Date().toISOString(),
          });
      }
    });
  });

  return io;
};

// Call routing function
const routeCallToAgent = async (callData) => {
  try {
    // Select best available agent
    const selectedAgent = await selectAgentForCall();

    if (!selectedAgent) {
      return {
        success: false,
        reason: "No available agents",
      };
    }

    // Assign call to agent
    const assignmentResult = await assignCallToAgent(
      selectedAgent.agentId,
      callData
    );

    if (!assignmentResult.success) {
      // Try next available agent if assignment failed
      const retryAgent = await selectAgentForCall();
      if (retryAgent && retryAgent.agentId !== selectedAgent.agentId) {
        return await assignCallToAgent(retryAgent.agentId, callData);
      }
      return assignmentResult;
    }

    // Notify the selected agent
    if (io) {
      io.to(`user:${selectedAgent.agentId}`).emit("call:incoming", {
        ...callData,
        assignedAt: new Date().toISOString(),
      });
    }

    return {
      success: true,
      agent: selectedAgent,
      strategy: "fair-distribution",
    };
  } catch (error) {
    console.error("Call routing error:", error);
    return {
      success: false,
      reason: error.message,
    };
  }
};

// Get agent statistics
const getAgentStatistics = async () => {
  try {
    const redis = getRedisClient();

    const [availableAgents, onCallAgents] = await Promise.all([
      redis.sMembers(REDIS_KEYS.AVAILABLE_AGENTS),
      redis.sMembers(REDIS_KEYS.AGENTS_ON_CALL),
    ]);

    const agentStats = await Promise.all(
      [...new Set([...availableAgents, ...onCallAgents])].map(
        async (agentId) => {
          const [status, calls] = await Promise.all([
            redis.hGetAll(REDIS_KEYS.AGENT_STATUS(agentId)),
            redis.hGetAll(REDIS_KEYS.AGENT_CALLS(agentId)),
          ]);

          return {
            agentId,
            status: status.status || "unknown",
            currentCalls: parseInt(calls.currentCalls || "0"),
            totalCalls: parseInt(calls.totalCalls || "0"),
            isAvailable: availableAgents.includes(agentId),
            isOnCall: onCallAgents.includes(agentId),
          };
        }
      )
    );

    return {
      totalAgents: agentStats.length,
      availableAgents: availableAgents.length,
      busyAgents: onCallAgents.length,
      agents: agentStats,
    };
  } catch (error) {
    console.error("Error getting agent statistics:", error);
    return null;
  }
};

// Broadcast functions
const broadcastCallUpdate = (callId, data) => {
  if (io) {
    io.to(`call:${callId}`).emit("call:updated", data);
  }
};

const broadcastQueueUpdate = (queueId, data) => {
  if (io) {
    io.to("role:agent")
      .to("role:supervisor")
      .to("role:admin")
      .emit("queue:updated", {
        queueId,
        ...data,
      });
  }
};

const notifyAgentOfIncomingCall = (agentId, callData) => {
  if (io) {
    io.to(`user:${agentId}`).emit("call:incoming", callData);
  }
};

const broadcastSystemMessage = (
  message,
  roles = ["admin", "supervisor", "agent"]
) => {
  if (io) {
    roles.forEach((role) => {
      io.to(`role:${role}`).emit("system:message", {
        message,
        timestamp: new Date().toISOString(),
      });
    });
  }
};

module.exports = {
  initializeSocket,
  broadcastCallUpdate,
  broadcastQueueUpdate,
  notifyAgentOfIncomingCall,
  broadcastSystemMessage,
  routeCallToAgent,
  getAgentStatistics,
  addAgentToRedis,
  removeAgentFromRedis,
  getAvailableAgentsFromRedis,
  assignCallToAgent,
  releaseAgentFromCall,
  selectAgentForCall,
};
