const logger = require('../utils/logger');
const { createErrorResponse } = require('../utils/helpers');

const errorHandler = (err, req, res, next) => {
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json(createErrorResponse(errors.join(', '), 'VALIDATION_ERROR'));
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json(createErrorResponse(`${field} already exists`, 'DUPLICATE_ERROR'));
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(createErrorResponse('Invalid token', 'AUTH_ERROR'));
  }

  // Default error
  res.status(err.statusCode || 500).json(
    createErrorResponse(
      err.message || 'Internal server error',
      err.code || 'INTERNAL_ERROR'
    )
  );
};

module.exports = { errorHandler };