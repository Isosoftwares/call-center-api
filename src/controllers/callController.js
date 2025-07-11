const Call = require("../models/Call");
const Agent = require("../models/Agent");
const {
  makeCall,
  createCallOptions,
  endCall,
} = require("../services/twilioService");
const { routeCall } = require("../services/callRoutingService");
const {
  createSuccessResponse,
  createErrorResponse,
  formatDate,
} = require("../utils/helpers");
// const { CALL_STATUS } = require("../utils/constants");
const { v4: uuidv4 } = require("uuid");
const { default: mongoose } = require("mongoose");
const { VoiceResponse } = require("twilio").twiml;

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

// Create outbound call
const createCall = async (req, res) => {
  try {
    const { phoneNumber, customerId, priority = 0 } = req.body;
    const agentId = req.user._id;

    // Generate unique call ID
    const callId = uuidv4();

    // Create call record
    const call = new Call({
      callId,
      phoneNumber,
      direction: "outbound",
      status: CALL_STATUS.QUEUED,
      callerInfo: {
        customerId,
        priority,
      },
      agentInfo: {
        agentId,
        agentName: `${req.user.profile?.firstName} ${req.user.profile?.lastName}`,
        department: req.user.profile?.department,
      },
      callDetails: {
        startTime: new Date(),
      },
    });

    await call.save();

    // Initiate Twilio call
    const callOptions = createCallOptions(
      phoneNumber,
      process.env.TWILIO_PHONE_NUMBER,
      `${process.env.BASE_URL}/api/webhooks/call-connect/${callId}`
    );

    const twilioCall = await makeCall(callOptions);

    // Update call with Twilio SID
    call.twilioCallSid = twilioCall.sid;
    call.status = CALL_STATUS.RINGING;
    await call.save();

    res
      .status(201)
      .json(createSuccessResponse(call, "Call initiated successfully"));
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get call history
const getCallHistory = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      phoneNumber,
      startDate,
      endDate,
      agentId
    } = req.query;

    // Build filter
    const filter = {  };
    if (agentId) {
      filter.assignedAgent = mongoose.Types.ObjectId(agentId);
    }

    console.log("📜 Call history filter:", filter, agentId);

    if (status) filter.status = status;
    if (phoneNumber)
      filter.phoneNumber = { $regex: phoneNumber, $options: "i" };
    if (startDate || endDate) {
      filter["callDetails.startTime"] = {};
      if (startDate) filter["callDetails.startTime"].$gte = new Date(startDate);
      if (endDate) filter["callDetails.startTime"].$lte = new Date(endDate);
    }

    const calls = await Call.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("agentInfo.agentId", "username profile");

    const total = await Call.countDocuments(filter);

    res.json(
      createSuccessResponse({
        calls,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      })
    );
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get active calls
const getActiveCalls = async (req, res) => {
  try {
    const activeCalls = await Call.find({
      status: {
        $in: [CALL_STATUS.RINGING, CALL_STATUS.IN_PROGRESS, CALL_STATUS.QUEUED],
      },
    }).populate("agentInfo.agentId", "username profile");

    res.json(createSuccessResponse(activeCalls));
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Update call status
const updateCallStatus = async (req, res) => {
  try {
    const { callId } = req.params;
    const { status, disposition, notes } = req.body;

    const call = await Call.findOne({ callId });
    if (!call) {
      return res.status(404).json(createErrorResponse("Call not found"));
    }

    // Update call details
    call.status = status;
    if (disposition) call.callDetails.disposition = disposition;
    if (notes) call.callDetails.notes = notes;

    if (status === CALL_STATUS.COMPLETED && !call.callDetails.endTime) {
      call.callDetails.endTime = new Date();
      call.callDetails.duration = Math.floor(
        (call.callDetails.endTime - call.callDetails.startTime) / 1000
      );
    }

    await call.save();

    res.json(createSuccessResponse(call, "Call updated successfully"));
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// End call
const terminateCall = async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await Call.findOne({ callId });
    if (!call) {
      return res.status(404).json(createErrorResponse("Call not found"));
    }

    // End call in Twilio
    if (call.twilioCallSid) {
      await endCall(call.twilioCallSid);
    }

    // Update call record
    call.status = CALL_STATUS.COMPLETED;
    call.callDetails.endTime = new Date();
    call.callDetails.duration = Math.floor(
      (call.callDetails.endTime - call.callDetails.startTime) / 1000
    );

    await call.save();

    res.json(createSuccessResponse(call, "Call ended successfully"));
  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Handle incoming call webhook
const handleIncomingCall = async (req, res) => {
  const twiml = new VoiceResponse();

  try {
    const { From, To, CallSid } = req.body;

    console.log("📞 Incoming call:", { From, To, CallSid });

    // Create call record
    const callId = uuidv4();
    const call = new Call({
      callId,
      twilioCallSid: CallSid,
      phoneNumber: From,
      direction: "inbound",
      status: CALL_STATUS.QUEUED,
      callDetails: {
        startTime: new Date(),
      },
    });
    await call.save();

    // Route call
    const routingResult = await routeCall(call);

    console.log("📊 Routing result:", routingResult);

    if (routingResult?.agent) {
      const agentPhone = "+254797936714"; // Placeholder for agent's phone number

      if (!agentPhone) {
        console.warn("⚠️ Agent found but has no phone number configured.");
        twiml.say("No phone number found for the assigned agent. Please hold.");
        twiml.enqueue("support-queue");
      } else {
        console.log("📲 Dialing agent phone:", agentPhone);
        const dial = twiml.dial();
        dial.number(agentPhone);
      }
    } else {
      console.log("ℹ️ No agent available, enqueuing call.");
      twiml.say("Please hold while we connect you to agent Antony Njenga.");
      twiml.enqueue("support-queue");
    }

  } catch (error) {
    console.error("❌ Error handling incoming call:", error);
    twiml.say("We are experiencing technical difficulties. Please try again later.");
  }

  res.type("text/xml").send(twiml.toString());
};

module.exports = {
  createCall,
  getCallHistory,
  getActiveCalls,
  updateCallStatus,
  terminateCall,
  handleIncomingCall,
};
