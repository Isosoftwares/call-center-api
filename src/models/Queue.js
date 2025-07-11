const mongoose = require('mongoose');
const { QUEUE_STRATEGY } = require('../utils/constants');

const queueSchema = new mongoose.Schema({
  queueId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  strategy: {
    type: String,
    enum: Object.values(QUEUE_STRATEGY),
    default: QUEUE_STRATEGY.ROUND_ROBIN
  },
  configuration: {
    maxWaitTime: {
      type: Number,
      default: 300 // 5 minutes
    },
    maxQueueSize: {
      type: Number,
      default: 100
    },
    skillsRequired: [String],
    priorityWeights: {
      customer: Number,
      agent: Number,
      time: Number
    }
  },
  agents: [{
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent'
    },
    weight: {
      type: Number,
      default: 1
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  metrics: {
    totalCalls: {
      type: Number,
      default: 0
    },
    averageWaitTime: Number,
    abandonmentRate: Number,
    peakHours: [Number]
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Queue', queueSchema);
