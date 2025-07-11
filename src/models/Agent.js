const mongoose = require('mongoose');
const { AGENT_STATUS } = require('../utils/constants');

const agentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  agentId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: Object.values(AGENT_STATUS),
    default: AGENT_STATUS.OFFLINE
  },
  skills: [{
    skill: String,
    level: {
      type: Number,
      min: 1,
      max: 5
    }
  }],
  capacity: {
    maxConcurrentCalls: {
      type: Number,
      default: 1
    },
    currentCalls: {
      type: Number,
      default: 0
    }
  },
  performance: {
    totalCalls: {
      type: Number,
      default: 0
    },
    totalTalkTime: {
      type: Number,
      default: 0
    },
    averageHandleTime: Number,
    satisfactionScore: Number
  },
  availability: {
    isOnline: {
      type: Boolean,
      default: false
    },
    lastStatusChange: Date,
    scheduledBreaks: [{
      startTime: Date,
      endTime: Date,
      type: String
    }]
  },
  currentCall: {
    callId: String,
    startTime: Date
  }
}, {
  timestamps: true
});

// Indexes
agentSchema.index({ status: 1, 'availability.isOnline': 1 });

module.exports = mongoose.model('Agent', agentSchema);
