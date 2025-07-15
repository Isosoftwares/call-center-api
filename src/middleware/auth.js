const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { createErrorResponse } = require('../utils/helpers');

// Functional approach to authentication
const verifyToken = (token) => {
  try {
    // return true;
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

const findUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

// Main authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json(createErrorResponse('Access token required'));
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    const user = await findUserById(decoded.userId);

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json(createErrorResponse(error.message, 'AUTH_ERROR'));
  }
};

// Role-based authorization
const authorize = (...roles) => (req, res, next) => {
  // if (!roles.includes(req.user.role)) {
  //   return res.status(403).json(createErrorResponse('Insufficient permissions'));
  // }
  next();
};

module.exports = { authenticate, authorize };


