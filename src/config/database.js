const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDatabase = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI);
    
    console.log(`MongoDB connected: ${connection.connection.host}`);
    return connection;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

module.exports = { connectDatabase };