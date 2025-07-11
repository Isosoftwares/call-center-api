const { rateLimiters, sanitizeInput } = require('../utils/security');
const { createErrorResponse } = require('../utils/helpers');

// Request sanitization middleware
const sanitizeRequest = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeInput(req.query[key]);
      }
    }
  }

  // Sanitize body parameters
  if (req.body && typeof req.body === 'object') {
    const sanitizeObject = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = sanitizeInput(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    };
    sanitizeObject(req.body);
  }

  next();
};

// IP whitelist middleware
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) return next();
    
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!allowedIPs.includes(clientIP)) {
      return res.status(403).json(createErrorResponse('IP not allowed', 'IP_FORBIDDEN'));
    }
    
    next();
  };
};

// API key validation for webhooks
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json(createErrorResponse('API key required'));
  }
  
  if (apiKey !== process.env.WEBHOOK_API_KEY) {
    return res.status(401).json(createErrorResponse('Invalid API key'));
  }
  
  next();
};

module.exports = {
  sanitizeRequest,
  ipWhitelist,
  validateApiKey,
  authRateLimit: rateLimiters.auth,
  apiRateLimit: rateLimiters.api,
  webhookRateLimit: rateLimiters.webhook
};