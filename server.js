const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;

// Functional approach to server initialization
const initializeServer = async () => {
  try {
    await connectDatabase();
    await connectRedis();
    
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Initialize WebSocket
    const { initializeSocket } = require('./src/websocket/socketHandlers');
    initializeSocket(server);

    return server;
  } catch (error) {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = (server) => (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

// Start server
initializeServer().then(server => {
  process.on('SIGTERM', gracefulShutdown(server));
  process.on('SIGINT', gracefulShutdown(server));
});