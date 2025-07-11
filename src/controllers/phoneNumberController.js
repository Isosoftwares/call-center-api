const PhoneNumber = require('../models/PhoneNumber');
const { purchasePhoneNumber, client } = require('../services/twilioService');
const { createSuccessResponse, createErrorResponse } = require('../utils/helpers');

// Get all phone numbers
const getPhoneNumbers = async (req, res) => {
  try {
    const { isActive, purpose } = req.query;
    
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (purpose) filter['assignment.purpose'] = purpose;

    const phoneNumbers = await PhoneNumber.find(filter)
      .sort({ createdAt: -1 });

    res.json(createSuccessResponse(phoneNumbers));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Purchase new phone number
const purchaseNumber = async (req, res) => {
  try {
    const { areaCode, friendlyName, purpose, queueId } = req.body;

    // Purchase from Twilio
    const twilioNumber = await purchasePhoneNumber(areaCode);

    // Save to database
    const phoneNumber = new PhoneNumber({
      phoneNumber: twilioNumber.phoneNumber,
      twilioSid: twilioNumber.sid,
      friendlyName: friendlyName || `Number for ${purpose}`,
      capabilities: {
        voice: true,
        sms: twilioNumber.capabilities.sms,
        mms: twilioNumber.capabilities.mms
      },
      configuration: {
        voiceUrl: `${process.env.BASE_URL}/api/webhooks/voice`,
        voiceMethod: 'POST',
        statusCallback: `${process.env.BASE_URL}/api/webhooks/call-status`,
        statusCallbackMethod: 'POST'
      },
      assignment: {
        purpose,
        queueId
      }
    });

    await phoneNumber.save();

    res.status(201).json(createSuccessResponse(phoneNumber, 'Phone number purchased successfully'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Update phone number configuration
const updatePhoneNumber = async (req, res) => {
  try {
    const { phoneNumberId } = req.params;
    const { friendlyName, assignment, isActive } = req.body;

    const phoneNumber = await PhoneNumber.findByIdAndUpdate(
      phoneNumberId,
      {
        $set: {
          friendlyName,
          assignment,
          isActive
        }
      },
      { new: true, runValidators: true }
    );

    if (!phoneNumber) {
      return res.status(404).json(createErrorResponse('Phone number not found'));
    }

    // Update Twilio configuration if needed
    if (assignment?.queueId) {
      await client.incomingPhoneNumbers(phoneNumber.twilioSid)
        .update({
          friendlyName,
          voiceUrl: `${process.env.BASE_URL}/api/webhooks/voice?queueId=${assignment.queueId}`
        });
    }

    res.json(createSuccessResponse(phoneNumber, 'Phone number updated successfully'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Release phone number
const releasePhoneNumber = async (req, res) => {
  try {
    const { phoneNumberId } = req.params;

    const phoneNumber = await PhoneNumber.findById(phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json(createErrorResponse('Phone number not found'));
    }

    // Release from Twilio
    await client.incomingPhoneNumbers(phoneNumber.twilioSid).remove();

    // Remove from database
    await PhoneNumber.findByIdAndDelete(phoneNumberId);

    res.json(createSuccessResponse(null, 'Phone number released successfully'));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

// Get phone number usage statistics
const getPhoneNumberStats = async (req, res) => {
  try {
    const { phoneNumberId } = req.params;
    const { period = '30d' } = req.query;

    const phoneNumber = await PhoneNumber.findById(phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json(createErrorResponse('Phone number not found'));
    }

    // Calculate date range
    const now = new Date();
    const periodMap = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    const startDate = new Date(now.getTime() - (periodMap[period] || periodMap['30d']));

    // Get call statistics
    const Call = require('../models/Call');
    const stats = await Call.aggregate([
      {
        $match: {
          phoneNumber: phoneNumber.phoneNumber,
          'callDetails.startTime': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          inboundCalls: {
            $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] }
          },
          outboundCalls: {
            $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] }
          },
          totalDuration: { $sum: '$callDetails.duration' },
          avgDuration: { $avg: '$callDetails.duration' }
        }
      }
    ]);

    const result = {
      phoneNumber: phoneNumber.phoneNumber,
      period,
      statistics: stats[0] || {
        totalCalls: 0,
        inboundCalls: 0,
        outboundCalls: 0,
        totalDuration: 0,
        avgDuration: 0
      }
    };

    res.json(createSuccessResponse(result));

  } catch (error) {
    res.status(500).json(createErrorResponse(error.message));
  }
};

module.exports = {
  getPhoneNumbers,
  purchaseNumber,
  updatePhoneNumber,
  releasePhoneNumber,
  getPhoneNumberStats
};