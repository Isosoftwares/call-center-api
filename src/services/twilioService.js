const { client } = require('../config/twilio');
const logger = require('../utils/logger');
const { pipe, curry } = require('../utils/helpers');

// Functional approach to Twilio operations
const createCallOptions = curry((to, from, url, method = 'POST') => ({
  to,
  from,
  url,
  method,
  record: true,
  statusCallback: `${process.env.BASE_URL}/api/webhooks/call-status`,
  statusCallbackMethod: 'POST'
}));

const makeCall = async (callOptions) => {
  try {
    const call = await client.calls.create(callOptions);
    logger.info('Call initiated:', { callSid: call.sid });
    return call;
  } catch (error) {
    logger.error('Failed to make call:', error);
    throw error;
  }
};

const updateCall = async (callSid, updates) => {
  try {
    const call = await client.calls(callSid).update(updates);
    logger.info('Call updated:', { callSid, updates });
    return call;
  } catch (error) {
    logger.error('Failed to update call:', error);
    throw error;
  }
};

const endCall = async (callSid) => {
  try {
    const call = await client.calls(callSid).update({ status: 'completed' });
    logger.info('Call ended:', { callSid });
    return call;
  } catch (error) {
    logger.error('Failed to end call:', error);
    throw error;
  }
};

const getCallLogs = async (filters = {}) => {
  try {
    const calls = await client.calls.list(filters);
    return calls;
  } catch (error) {
    logger.error('Failed to fetch call logs:', error);
    throw error;
  }
};

// Phone number management
const purchasePhoneNumber = async (areaCode, capabilities = { voice: true }) => {
  try {
    // Search for available numbers
    const availableNumbers = await client.availablePhoneNumbers('US')
      .local
      .list({ areaCode, limit: 1 });

    if (!availableNumbers.length) {
      throw new Error('No available numbers in this area code');
    }

    // Purchase the number
    const phoneNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: availableNumbers[0].phoneNumber,
      voiceUrl: `${process.env.BASE_URL}/api/webhooks/voice`,
      voiceMethod: 'POST'
    });

    logger.info('Phone number purchased:', { phoneNumber: phoneNumber.phoneNumber });
    return phoneNumber;
  } catch (error) {
    logger.error('Failed to purchase phone number:', error);
    throw error;
  }
};

module.exports = {
  createCallOptions,
  makeCall,
  updateCall,
  endCall,
  getCallLogs,
  purchasePhoneNumber
};