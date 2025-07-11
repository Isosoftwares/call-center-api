const R = require('ramda');

// Pure function helpers
const compose = R.compose;
const pipe = R.pipe;
const curry = R.curry;

// Async composition
const asyncPipe = (...fns) => (value) => fns.reduce(async (acc, fn) => fn(await acc), value);

// Safe property access
const safeGet = curry((path, obj) => R.path(path.split('.'), obj));

// Response formatters
const createSuccessResponse = (data, message = 'Success') => ({
  success: true,
  message,
  data,
  timestamp: new Date().toISOString()
});

const createErrorResponse = (message, code = 'GENERAL_ERROR') => ({
  success: false,
  error: { message, code },
  timestamp: new Date().toISOString()
});

// Validation helpers
const isValidPhoneNumber = (phone) => /^\+[1-9]\d{1,14}$/.test(phone);
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Date helpers
const formatDate = (date) => new Date(date).toISOString();
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

module.exports = {
  compose,
  pipe,
  curry,
  asyncPipe,
  safeGet,
  createSuccessResponse,
  createErrorResponse,
  isValidPhoneNumber,
  isValidEmail,
  formatDate,
  addMinutes
};