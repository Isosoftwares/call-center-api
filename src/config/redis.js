const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => logger.error('Redis Client Error', err));
    
    await redisClient.connect();
    console.log('Redis connected successfully');
    
    return redisClient;
  } catch (error) {
    console.error('Redis connection failed:', error);
    throw error;
  }
};

const getRedisClient = () => redisClient;

module.exports = { connectRedis, getRedisClient };
