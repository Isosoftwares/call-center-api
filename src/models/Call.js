const mongoose = require('mongoose');
const { CALL_STATUS } = require('../utils/constants');

const callSchema = new mongoose.Schema({
  callId: {
    type: String,
    required: true,
    unique: true
  },
  assignedAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true // Allows null values for unassigned calls
  },
  twilioCallSid: {
    type: String,
    unique: true,
    sparse: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },
  status: {
    type: String,
    enum: Object.values(CALL_STATUS),
    default: CALL_STATUS.QUEUED
  },
  callerInfo: {
    name: String,
    customerId: String,
    accountType: String,
    priority: {
      type: Number,
      default: 0
    }
  },
  agentInfo: {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    agentName: String,
    department: String
  },
  callDetails: {
    startTime: Date,
    endTime: Date,
    duration: Number, // in seconds
    twilioNumber: String,
    callerNumber: String,
    transferredFrom: String,
    conferenceParticipants: [String]
  },
  queueInfo: {
    queueId: String,
    queueTime: Number, // in seconds
    position: Number
  },
  recording: {
    recordingSid: String,
    recordingUrl: String,
    duration: Number
  },
  metadata: {
    userAgent: String,
    clientIp: String,
    campaign: String,
    tags: [String]
  }
}, {
  timestamps: true
});

// Indexes for performance
callSchema.index({ phoneNumber: 1, createdAt: -1 });
callSchema.index({ status: 1 });
callSchema.index({ 'callDetails.startTime': 1 });

module.exports = mongoose.model('Call', callSchema);
