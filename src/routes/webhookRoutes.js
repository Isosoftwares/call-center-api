const express = require('express');
const router = express.Router();
const { handleIncomingCall } = require('../controllers/callController');
const { validateTwilioSignature } = require('../middleware/twilioWebhook');
const { createSuccessResponse } = require('../utils/helpers');
const Call = require('../models/Call');
const { broadcastCallUpdate } = require('../websocket/socketHandlers');

// Voice webhook - handles incoming calls
router.post('/voice', validateTwilioSignature, handleIncomingCall);

// Call status webhook - handles call status updates
router.post('/call-status', validateTwilioSignature, async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, From, To } = req.body;

    // Update call record
    const call = await Call.findOneAndUpdate(
      { twilioCallSid: CallSid },
      {
        $set: {
          status: CallStatus,
          'callDetails.duration': parseInt(CallDuration) || 0,
          'callDetails.endTime': CallStatus === 'completed' ? new Date() : undefined
        }
      },
      { new: true }
    );

    if (call) {
      // Broadcast update via WebSocket
      broadcastCallUpdate(call.callId, {
        status: CallStatus,
        duration: CallDuration
      });
    }

    res.json(createSuccessResponse(null, 'Status updated'));

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Call connect webhook - connects call to agent
router.post('/call-connect/:callId', validateTwilioSignature, async (req, res) => {
  try {
    const { callId } = req.params;
    const { CallSid } = req.body;

    const call = await Call.findOne({ callId });
    if (!call) {
      const twiml = new (require('twilio')).twiml.VoiceResponse();
      twiml.say('Call not found.');
      return res.type('text/xml').send(twiml.toString());
    }

    // Generate TwiML to connect to agent
    const twiml = new (require('twilio')).twiml.VoiceResponse();
    
    if (call.agentInfo?.agentId) {
      // Connect to specific agent
      twiml.dial().client(`agent_${call.agentInfo.agentId}`);
    } else {
      // Put in queue
      twiml.say('Please hold while we connect you to an agent.');
      twiml.enqueue('default-queue');
    }

    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error('Connect webhook error:', error);
    const twiml = new (require('twilio')).twiml.VoiceResponse();
    twiml.say('We are experiencing technical difficulties.');
    res.type('text/xml').send(twiml.toString());
  }
});

module.exports = router;
