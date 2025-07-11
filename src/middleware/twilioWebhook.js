const twilio = require("twilio");
const { createErrorResponse } = require("../utils/helpers");

const validateTwilioSignature = (req, res, next) => {
  const signature = req.headers["x-twilio-signature"];
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  console.log("Validating Twilio signature:", {
    signature,
    url,
    body: req.body,
  });

  const isValid = twilio.validateRequest(authToken, signature, url, req.body);

  console.log("Twilio signature validation result:", isValid);

  if (isValid) {
    console.error("Invalid Twilio signature:", {
      signature,
      url,
      body: req.body,
    });
    return res
      .status(401)
      .json(createErrorResponse("Invalid webhook signature"));
  }

  next();
};

module.exports = { validateTwilioSignature };
