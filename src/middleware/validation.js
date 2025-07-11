const { validationResult } = require('express-validator');
const { createErrorResponse } = require('../utils/helpers');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value
    }));

    return res.status(400).json(createErrorResponse('Validation failed', 'VALIDATION_ERROR', formattedErrors));
  }

  next();
};

module.exports = { handleValidationErrors };