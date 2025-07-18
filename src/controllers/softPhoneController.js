const express = require("express");
const { VoiceResponse } = require("twilio").twiml;
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const twilio = require("twilio");
const Call = require("../models/Call");
const { routeCall } = require("../services/callRoutingService"); // Import your call routing logic
const {
  selectAgentForCall,
  getAvailableAgentsFromRedis,
  assignCallToAgent,
  releaseAgentFromCall,
} = require("../websocket/socketHandlers");
const PhoneNumber = require("../models/PhoneNumber");

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const CALL_STATUS = {
  QUEUED: "queued",
  RINGING: "ringing",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  FAILED: "failed",
  BUSY: "busy",
  NO_ANSWER: "no-answer",
};

const formatPhoneNumber = (phone) => {
  if (!phone) return null;

  // Remove any spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");

  // Add + if missing
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
};

// Generate Twilio Access Token for WebRTC
const generateAccessToken = (agentId, agentName) => {
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  // Create an access token which we will sign and return to the client
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity: agentId }
  );

  // Create a Voice grant and add to the token
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    incomingAllow: true, // Allow incoming calls
  });

  token.addGrant(voiceGrant);
  token.identity = agentId;

  return {
    identity: agentId,
    token: token.toJwt(),
  };
};

// Get access token for agent
const getAccessToken = async (req, res) => {
  try {
    const { agentId, agentName } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: "Agent ID is required" });
    }

    const tokenData = generateAccessToken(agentId, agentName);

    console.log(tokenData);

    console.log(`🔑 Generated access token for agent: ${agentId}`);

    res.json(tokenData);
  } catch (error) {
    console.error("❌ Error generating access token:", error);
    res.status(500).json({ error: "Failed to generate access token" });
  }
};

// Handle incoming calls - now routes to softphone instead of phone number
const handleIncomingCall = async (req, res) => {
  const twiml = new VoiceResponse();

  try {
    const { From, To, CallSid, CallStatus } = req.body;

    console.log("full body incoming", req.body);

    const twilioPhoneNumberDB = await PhoneNumber.findOne({
      phoneNumber: formatPhoneNumber(To),
    });

    // Create call record
    const callId = uuidv4();
    const call = new Call({
      callId,
      twilioCallSid: CallSid,
      phoneNumber: From,
      direction: "inbound",
      status: CALL_STATUS.QUEUED,
      phoneNumberId: twilioPhoneNumberDB ? twilioPhoneNumberDB._id : null,
      callDetails: {
        startTime: new Date(),
        callerNumber: From,
        twilioNumber: To,
      },
    });
    await call.save();

    // Route call to available agent
    const routingResult = await selectAgentForCall();

    console.log("📊 Routing result:", routingResult);

    if (routingResult?.agentId) {
      console.log("📲 Routing to softphone agent:", routingResult.agentId);

      // Update call status
      await Call.findOneAndUpdate(
        { callId },
        {
          status: CALL_STATUS.RINGING,
          assignedAgent: routingResult.agentId,
        }
      );

      // Route to softphone client instead of phone number
      // twiml.say(
      //   "Thank you for calling. We're connecting you to an available agent."
      // );

      const dial = twiml.dial({
        action: "/api/calls/dial-status",
        method: "POST",
        timeout: 30,
        callerId: To,
        record: "record-from-answer",
      });

      // Dial to the agent's softphone identity
      dial.client(routingResult.agentId);
      assignCallToAgent(routingResult.agentId, call);
    } else {
      console.log("ℹ️ No agent available, enqueuing call.");

      await Call.findOneAndUpdate(
        { callId },
        { status: CALL_STATUS.NO_ANSWER, comment: "Missed call" }
      );

      twiml.say("Call ended");
      twiml.hangup();
      // twiml.enqueue("support-queue", {
      //   action: "/api/calls/queue-status",
      //   method: "POST",
      //   waitUrl: "/api/calls/hold-music",
      // });

      return res.type("text/xml").send(twiml.toString());
    }
  } catch (error) {
    console.error("❌ Error handling incoming call:", error);
    // twiml.say(
    //   "We are experiencing technical difficulties. Please try again later."
    // );
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
};

// Handle outbound calls from softphone to client phones
const handleOutboundCall = async (req, res) => {
  const twiml = new VoiceResponse();

  try {
    let { To, Caller, From, CallSid } = req.body;

    const Called = To;

    console.log("📞 Outbound call from softphone:", { Called, Caller, From });

    // Called will be the phone number the agent wants to call
    // Caller will be the agent's identity
    const twilioPhoneNumberDB = await PhoneNumber.findOne({
      phoneNumber: formatPhoneNumber(Caller),
    });

    if (Called && Called.startsWith("+")) {
      // This is a call to a regular phone number
      console.log(`📲 Connecting agent ${Caller} to phone number ${Called}`);

      const dial = twiml.dial({
        callerId: From, // Your Twilio number
        action: "/api/calls/outbound-status",
        method: "POST",
      });

      dial.number(Called);

      // Log the outbound call
      const callId = uuidv4();
      const call = new Call({
        callId,
        phoneNumber: Called,
        direction: "outbound",
        status: CALL_STATUS.RINGING,
        twilioCallSid: CallSid,
        phoneNumberId: twilioPhoneNumberDB ? twilioPhoneNumberDB._id : null,
        assignedAgent: Caller.split(":")[1], // Extract agent ID from Caller
        callDetails: {
          startTime: new Date(),
          agentId: Caller,
          targetNumber: Called,
          twilioNumber: From,
        },
      });
      await call.save();
      assignCallToAgent(call.assignedAgent, call);
    } else {
      // Invalid number
      twiml.say(
        "The number you are trying to reach is invalid. Please check the number and try again."
      );
      twiml.hangup();
    }
  } catch (error) {
    console.error("❌ Error handling outbound call:", error);
    twiml.say("We're unable to complete your call at this time.");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
};

// Handle dial status for softphone calls with agent failover
const handleDialStatus = async (req, res) => {
  const twiml = new VoiceResponse();

  try {
    const {
      DialCallStatus = "completed",
      CallSid,
      DialCallDuration,
      RecordingUrl,
    } = req.body;

    console.log("📞 Dial status:", {
      DialCallStatus,
      CallSid,
      Duration: DialCallDuration,
    });

    twiml.hangup();
    const call = await Call.findOne({ twilioCallSid: CallSid });
    // Release agent from call in Redis
    if (call.assignedAgent) {
      await releaseAgentFromCall(call.assignedAgent, {
        callId: call.callId,
        completed: true,
      });
    }
    return res.type("text/xml").send(twiml.toString());

    // Find the call record

    if (!call) {
      console.error("❌ Call record not found for CallSid:", CallSid);
      twiml.say("We're experiencing technical difficulties.");
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }

    // Update call record with dial status
    await Call.findOneAndUpdate(
      { twilioCallSid: CallSid },
      {
        "callDetails.dialDuration": DialCallDuration,
        "callDetails.recordingUrl": RecordingUrl,
        "callDetails.lastDialStatus": DialCallStatus,
        "callDetails.lastStatusUpdate": new Date(),
      }
    );

    switch (DialCallStatus) {
      case "completed":
        console.log("✅ Softphone call completed successfully");

        // Update final call status
        await Call.findOneAndUpdate(
          { twilioCallSid: CallSid },
          {
            status: CALL_STATUS.COMPLETED,
            "callDetails.endTime": new Date(),
          }
        );

        // Release agent from call in Redis
        if (call.assignedAgent) {
          await releaseAgentFromCall(call.assignedAgent, {
            callId: call.callId,
            completed: true,
          });
        }

        twiml.hangup();
        break;

      case "busy":
      case "no-answer":
      case "failed":
      case "canceled":
        console.log(
          `📞 Agent ${call.assignedAgent} unavailable (${DialCallStatus}), trying another agent`
        );

        // Release the current agent from the call
        if (call.assignedAgent) {
          await releaseAgentFromCall(call.assignedAgent, {
            callId: call.callId,
            failed: true,
            reason: DialCallStatus,
          });
        }

        // Build exclusion list with current agent and any previously failed agents
        const excludeAgents = [];
        if (call.assignedAgent) {
          excludeAgents.push(call.assignedAgent);
        }
        if (call.callDetails?.failedAgents) {
          excludeAgents.push(...call.callDetails.failedAgents);
        }

        console.log("🚫 Excluding agents:", excludeAgents);

        // Try to find another available agent
        const routingResult = await selectAgentForCallExcluding(excludeAgents);

        if (routingResult?.agentId) {
          console.log(
            "🎯 Routing to alternative agent:",
            routingResult.agentId
          );

          // Track the failed agent
          const failedAgents = call.callDetails?.failedAgents || [];
          if (
            call.assignedAgent &&
            !failedAgents.includes(call.assignedAgent)
          ) {
            failedAgents.push(call.assignedAgent);
          }

          // Update call with new agent assignment
          await Call.findOneAndUpdate(
            { callId: call.callId },
            {
              status: CALL_STATUS.RINGING,
              assignedAgent: routingResult.agentId,
              "callDetails.agentId": routingResult.agentId,
              "callDetails.failedAgents": failedAgents,
              "callDetails.retryCount": (call.callDetails?.retryCount || 0) + 1,
              "callDetails.lastFailureReason": DialCallStatus,
            }
          );

          // Assign the call to the new agent in Redis
          await assignCallToAgent(routingResult.agentId, {
            callId: call.callId,
            twilioCallSid: CallSid,
            retryAttempt: true,
            previousFailure: DialCallStatus,
          });

          // Route directly to the new agent
          twiml.say("Connecting you to another available agent.");

          const dial = twiml.dial({
            action: "/api/calls/dial-status",
            method: "POST",
            timeout: 30,
            record: "record-from-answer",
          });

          // Dial to the new agent's softphone identity
          dial.client(routingResult.agentId);
        } else {
          // No other agents available, fall back to queue
          console.log("📞 No other agents available, falling back to queue");

          // Track the failed agent
          const failedAgents = call.callDetails?.failedAgents || [];
          if (
            call.assignedAgent &&
            !failedAgents.includes(call.assignedAgent)
          ) {
            failedAgents.push(call.assignedAgent);
          }

          // Update call status
          await Call.findOneAndUpdate(
            { callId: call.callId },
            {
              status: CALL_STATUS.QUEUED,
              assignedAgent: null,
              "callDetails.agentId": null,
              "callDetails.failedAgents": failedAgents,
              "callDetails.fallbackToQueue": true,
              "callDetails.lastFailureReason": DialCallStatus,
            }
          );

          twiml.say(
            "All our agents are currently busy. Please hold while we connect you to the next available agent."
          );
          twiml.enqueue("support-queue", {
            action: "/api/calls/queue-status",
            method: "POST",
            waitUrl: "/api/calls/hold-music",
          });
        }
        break;

      default:
        console.log("📞 Unknown dial status:", DialCallStatus);

        // Release current agent if assigned
        if (call.assignedAgent) {
          await releaseAgentFromCall(call.assignedAgent, {
            callId: call.callId,
            failed: true,
            reason: `unknown_status_${DialCallStatus}`,
          });
        }

        // Update call status
        await Call.findOneAndUpdate(
          { callId: call.callId },
          {
            status: CALL_STATUS.QUEUED,
            assignedAgent: null,
            "callDetails.lastFailureReason": DialCallStatus,
          }
        );

        twiml.say(
          "We're experiencing connection issues. Please hold for the next available agent."
        );
        twiml.enqueue("support-queue", {
          action: "/api/calls/queue-status",
          method: "POST",
          waitUrl: "/api/calls/hold-music",
        });
    }
  } catch (error) {
    console.error("❌ Error handling dial status:", error);

    // Try to release any assigned agent on error
    try {
      const call = await Call.findOne({ twilioCallSid: CallSid });
      if (call?.assignedAgent) {
        await releaseAgentFromCall(call.assignedAgent, {
          callId: call.callId,
          failed: true,
          reason: "system_error",
        });
      }
    } catch (releaseError) {
      console.error("❌ Error releasing agent on error:", releaseError);
    }

    twiml.say("We're experiencing technical difficulties.");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
};

// Handle outbound call status
const handleOutboundStatus = async (req, res) => {
  const twiml = new VoiceResponse();

  try {
    const { DialCallStatus, CallSid, DialCallDuration } = req.body;

    console.log("📞 Outbound call status:", {
      DialCallStatus,
      CallSid,
      DialCallDuration,
    });

    // Update call record
    await Call.findOneAndUpdate(
      { twilioCallSid: CallSid },
      {
        status: DialCallStatus === "completed" ? "completed" : DialCallStatus,
        "callDetails.duration": DialCallDuration,
        "callDetails.endTime": new Date(),
      }
    );

    if (DialCallStatus === "completed") {
      console.log("✅ Outbound call completed");
    } else {
      console.log(`📞 Outbound call ended with status: ${DialCallStatus}`);
    }
  } catch (error) {
    console.error("❌ Error handling outbound status:", error);
  }

  res.type("text/xml").send(twiml.toString());
};

// Get agent status and call history
const getAgentStatus = async (req, res) => {
  try {
    const { agentId } = req.params;

    // Get recent calls for this agent
    const recentCalls = await Call.find({
      assignedAgent: agentId,
      "callDetails.startTime": {
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    })
      .sort({ "callDetails.startTime": -1 })
      .limit(10);

    // Get current active calls
    const activeCalls = await Call.find({
      assignedAgent: agentId,
      status: { $in: [CALL_STATUS.RINGING, CALL_STATUS.IN_PROGRESS] },
    });

    res.json({
      agentId,
      activeCalls: activeCalls.length,
      recentCalls,
      status: activeCalls.length > 0 ? "busy" : "available",
    });
  } catch (error) {
    console.error("❌ Error getting agent status:", error);
    res.status(500).json({ error: "Failed to get agent status" });
  }
};

// Make outbound call from API
const initiateOutboundCall = async (req, res) => {
  try {
    const { agentId, phoneNumber, callerId } = req.body;

    if (!agentId || !phoneNumber) {
      return res
        .status(400)
        .json({ error: "Agent ID and phone number are required" });
    }

    console.log(
      `📞 Initiating outbound call from agent ${agentId} to ${phoneNumber}`
    );

    // Create call record
    const callId = uuidv4();
    const call = new Call({
      callId,
      phoneNumber,
      direction: "outbound",
      status: CALL_STATUS.RINGING,
      assignedAgent: agentId,
      callDetails: {
        startTime: new Date(),
        agentId,
        targetNumber: phoneNumber,
      },
    });
    await call.save();

    // Initiate the call using Twilio's REST API
    const twilioCall = await client.calls.create({
      url: `${process.env.BASE_URL}/api/calls/outbound-bridge?agentId=${agentId}&callId=${callId}`,
      to: phoneNumber,
      from: callerId || process.env.TWILIO_PHONE_NUMBER,
      statusCallback: `${process.env.BASE_URL}/api/calls/status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });

    // Update call with Twilio SID
    await Call.findOneAndUpdate({ callId }, { twilioCallSid: twilioCall.sid });

    res.json({
      success: true,
      callId,
      twilioCallSid: twilioCall.sid,
      status: "initiated",
    });
  } catch (error) {
    console.error("❌ Error initiating outbound call:", error);
    res.status(500).json({ error: "Failed to initiate call" });
  }
};

// Bridge outbound call to agent's softphone
const handleOutboundBridge = async (req, res) => {
  const twiml = new VoiceResponse();

  try {
    const { agentId, callId } = req.query;

    console.log(`🌉 Bridging outbound call to agent ${agentId}`);

    // Once the external number answers, connect to agent's softphone
    const dial = twiml.dial({
      action: "/api/calls/outbound-status",
      method: "POST",
    });

    dial.client(agentId);
  } catch (error) {
    console.error("❌ Error bridging outbound call:", error);
    twiml.say("Unable to connect your call at this time.");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
};

// Queue status handler (same as before)
const handleQueueStatus = async (req, res) => {
  const twiml = new VoiceResponse();

  try {
    const { QueueResult, CallSid, QueueTime } = req.body;

    console.log("📋 Queue status:", { QueueResult, CallSid, QueueTime });

    await Call.findOneAndUpdate(
      { twilioCallSid: CallSid },
      {
        "callDetails.queueTime": QueueTime,
        "callDetails.queueResult": QueueResult,
      }
    );

    switch (QueueResult) {
      case "bridged":
        console.log("✅ Call successfully bridged from queue");
        break;
      case "hangup":
        console.log("📞 Caller hung up while in queue");
        await Call.findOneAndUpdate(
          { twilioCallSid: CallSid },
          {
            status: "completed",
            "callDetails.endTime": new Date(),
            "callDetails.endReason": "caller_hangup_in_queue",
          }
        );
        break;
      case "error":
        console.log("❌ Queue error occurred");
        twiml.say(
          "We're experiencing technical difficulties. Please try calling back later."
        );
        twiml.hangup();
        break;
    }
  } catch (error) {
    console.error("❌ Error handling queue status:", error);
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
};

// Enhanced agent selection that excludes specific agents
const selectAgentForCallExcluding = async (excludeAgentIds = []) => {
  try {
    const availableAgents = await getAvailableAgentsFromRedis();

    console.log("🔍 Available agents for call:", availableAgents);

    if (!availableAgents.length) {
      return null;
    }

    // Filter out excluded agents
    const filteredAgents = availableAgents.filter(
      (agent) => !excludeAgentIds.includes(agent.agentId)
    );

    if (!filteredAgents.length) {
      console.log("🚫 No agents available after excluding:", excludeAgentIds);
      return null;
    }

    // Sort by total calls (ascending) then by last assigned time (ascending)
    // This ensures fair distribution
    filteredAgents.sort((a, b) => {
      if (a.totalCalls !== b.totalCalls) {
        return a.totalCalls - b.totalCalls;
      }
      return a.lastAssigned - b.lastAssigned;
    });

    return filteredAgents[0];
  } catch (error) {
    console.error("Error selecting agent for call (excluding):", error);
    return null;
  }
};

// Enhanced hold music handler with agent availability check
const handleHoldMusic = async (req, res) => {
  const twiml = new VoiceResponse();

  try {
    const { CallSid, QueueSid } = req.body;
    console.log("🎵 Checking for agents while on hold:", CallSid);

    // Find the call record to check for previously assigned agent
    const call = await Call.findOne({ twilioCallSid: CallSid });

    // Get list of agents to exclude (previously tried agents)
    const excludeAgents = [];
    if (call?.assignedAgent) {
      excludeAgents.push(call.assignedAgent);
      console.log("🚫 Excluding previously tried agent:", call.assignedAgent);
    }

    // Also check for any failed assignment history
    if (call?.callDetails?.failedAgents) {
      excludeAgents.push(...call.callDetails.failedAgents);
      console.log("🚫 Excluding failed agents:", call.callDetails.failedAgents);
    }

    // Try to find an available agent (excluding previously tried ones)
    const routingResult = await selectAgentForCallExcluding(excludeAgents);

    if (routingResult?.agentId) {
      console.log(
        "🎯 Different agent became available, connecting call:",
        routingResult.agentId
      );

      if (call) {
        // Track the previous agent as failed if there was one
        const failedAgents = call.callDetails?.failedAgents || [];
        if (call.assignedAgent && !failedAgents.includes(call.assignedAgent)) {
          failedAgents.push(call.assignedAgent);
        }

        // Update call status and assign new agent
        await Call.findOneAndUpdate(
          { callId: call.callId },
          {
            status: CALL_STATUS.RINGING,
            assignedAgent: routingResult.agentId,
            "callDetails.agentId": routingResult.agentId,
            "callDetails.connectedFromQueue": true,
            "callDetails.failedAgents": failedAgents,
            "callDetails.retryCount": (call.callDetails?.retryCount || 0) + 1,
          }
        );

        // Assign the call to the agent in Redis
        await assignCallToAgent(routingResult.agentId, {
          callId: call.callId,
          twilioCallSid: CallSid,
          fromQueue: true,
          retryAttempt: true,
        });
      }

      // Connect to the available agent
      twiml.say("An agent is now available. Connecting you now.");

      const dial = twiml.dial({
        action: "/api/calls/dial-status",
        method: "POST",
        timeout: 30,
        record: "record-from-answer",
      });

      // Dial to the agent's softphone identity
      dial.client(routingResult.agentId);
    } else {
      // No different agent available, continue with hold music
      console.log(
        "🎵 No different agent available, continuing hold music for:",
        CallSid
      );

      twiml.play(
        "http://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.wav"
      );
      twiml.say(
        "Thank you for holding. Your call is important to us and will be answered shortly."
      );
      twiml.play(
        "http://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.wav"
      );
    }
  } catch (error) {
    console.error("❌ Error in hold music handler:", error);

    // Fallback to standard hold music
    twiml.play(
      "http://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.wav"
    );
    twiml.say("Please continue to hold.");
  }

  res.type("text/xml").send(twiml.toString());
};

// Call status webhook handler
const handleCallStatus = async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, RecordingUrl } = req.body;

    console.log("📊 Call status update:", {
      CallSid,
      CallStatus,
      CallDuration,
    });

    await Call.findOneAndUpdate(
      { twilioCallSid: CallSid },
      {
        status: CallStatus,
        "callDetails.finalDuration": CallDuration,
        "callDetails.finalRecordingUrl": RecordingUrl,
        "callDetails.statusUpdateTime": new Date(),
      }
    );

    if (
      ["completed", "busy", "no-answer", "failed", "canceled"].includes(
        CallStatus
      )
    ) {
      await Call.findOneAndUpdate(
        { twilioCallSid: CallSid },
        {
          "callDetails.endTime": new Date(),
          "callDetails.endReason": CallStatus,
        }
      );
    }
  } catch (error) {
    console.error("❌ Error handling call status update:", error);
  }

  res.status(200).send("OK");
};

module.exports = {
  generateAccessToken,
  getAccessToken,
  handleIncomingCall,
  handleOutboundCall,
  handleDialStatus,
  handleOutboundStatus,
  getAgentStatus,
  initiateOutboundCall,
  handleOutboundBridge,
  handleQueueStatus,
  handleHoldMusic,
  handleCallStatus,
};
