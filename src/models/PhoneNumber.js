const mongoose = require('mongoose');

const phoneNumberSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  twilioSid: {
    type: String,
    required: true,
    unique: true
  },
  friendlyName: String,
  capabilities: {
    voice: Boolean,
    sms: Boolean,
    mms: Boolean
  },
  configuration: {
    voiceUrl: String,
    voiceMethod: {
      type: String,
      default: 'POST'
    },
    statusCallback: String,
    statusCallbackMethod: {
      type: String,
      default: 'POST'
    }
  },
  assignment: {
    queueId: String,
    department: String,
    purpose: String // main, support, sales, etc.
  },
  usage: {
    totalCalls: {
      type: Number,
      default: 0
    },
    lastUsed: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PhoneNumber', phoneNumberSchema);
