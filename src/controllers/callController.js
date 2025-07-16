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
const PhoneNumber = require("../models/PhoneNumber");
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

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCallHistory = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      phoneNumber,
      twilioNumber,
      startDate,
      endDate,
      agentId,
    } = req.query;

    const filter = {};

    if (agentId) {
      filter.assignedAgent = mongoose.Types.ObjectId(agentId);
    }

    if (status) filter.status = status;

    if (phoneNumber) {
      filter["callDetails.callerNumber"] = {
        $regex: escapeRegex(phoneNumber),
        $options: "i",
      };
    }

    if (twilioNumber) {
      filter["callDetails.twilioNumber"] = {
        $regex: escapeRegex(twilioNumber),
        $options: "i",
      };
    }

    if (startDate || endDate) {
      filter["callDetails.startTime"] = {};
      if (startDate) filter["callDetails.startTime"].$gte = new Date(startDate);
      if (endDate) filter["callDetails.startTime"].$lte = new Date(endDate);
    }

    const calls = await Call.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("assignedAgent", "username profile")
      .populate("phoneNumberId");

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
    console.error(error);
    res.status(500).json(createErrorResponse(error.message));
  }
};

const addComment = async (req, res) => {
  const { callId, comment, twilioNumber } = req.body;

  if (!callId || !comment) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Try to find the call by twilioCallSid
    let call = await Call.findOne({ twilioCallSid: callId });

    if (!call && twilioNumber) {
      // If not found, fallback: find by twilioNumber
      const phoneNumber = await PhoneNumber.findOne({
        phoneNumber: twilioNumber,
      }).lean();

      if (!phoneNumber) {
        return res.status(400).json({ message: "No phone number found" });
      }

      call = await Call.findOne({ phoneNumberId: phoneNumber._id }).sort({
        createdAt: -1,
      });
    }

    if (!call) {
      return res.status(404).json({ message: "No call log found" });
    }

    call.comment = comment;
    await call.save();

    return res.status(200).json({ message: "Comment added successfully" });
  } catch (error) {
    console.error("addComment error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getCallHistory,
  addComment,
};
