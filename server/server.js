/**
 * Server Entry Point
 * Creates HTTP server, initializes Socket.IO, and starts the application
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const { createLogger } = require('./utils/logger');
const { isProduction, getEnv, validateEnvironment } = require('./config/environment');

// Create logger first for error reporting
const logger = createLogger('SERVER');

// Validate environment variables BEFORE importing app
// This ensures env vars are validated before any modules try to use them
try {
  validateEnvironment();
} catch (error) {
  logger.error('Environment validation failed', { error: error.message });
  process.exit(1);
}

// Import modules after validation
const { connectDatabase, closeDatabase } = require('./config/database');
const { CORS_ORIGINS } = require('./config/constants');
const showBanner = require('./banner');
const app = require('./app');

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  cookie: {
    name: 'io',
    httpOnly: true,
    sameSite: 'lax'
  }
});

// Initialize Socket.IO handlers
const socketHandler = require('./socketHandler');
socketHandler(io);

// Initialize Chat Socket.IO handler
const { initializeChatSocket } = require('./socket/chatSocket');
initializeChatSocket(io);

// Initialize Data Socket.IO handler for real-time updates
const { initializeDataSocket } = require('./socket/dataSocket');
initializeDataSocket(io);

// Make io available to app if needed
app.set('io', io);

const PORT = getEnv('PORT', 8000);

/**
 * Start the server
 */
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();

    // Initialize session middleware AFTER database connection
    const { initializeSessionMiddleware } = require('./app');
    initializeSessionMiddleware();
    logger.info('Session middleware initialized');

    // Initialize WhatsApp Client (non-blocking)
    const { initializeWhatsApp } = require('./services/whatsapp');
    const { startScheduler } = require('./services/scheduler');

    logger.info('Initializing WhatsApp notification service...');

    // Start WhatsApp initialization in background
    initializeWhatsApp()
      .then(() => {
        logger.info('WhatsApp notification service started successfully');
        // Start scheduler after WhatsApp is ready
        startScheduler();
      })
      .catch((error) => {
        logger.error('Failed to initialize WhatsApp service:', error.message || error);
        logger.warn('Server will continue without WhatsApp notifications');
      });

    // Start HTTP server
    httpServer.listen(PORT, () => {
      showBanner();
      logger.info(`Server running on port ${PORT}`);
      logger.info('Socket.IO server initialized for video calling');
      logger.info('Environment variables:');
      logger.info(`- MONGO_URI: ${getEnv('MONGO_URI') ? 'Set' : 'Not set'}`);
      logger.info(`- GOOGLE_CLIENT_ID: ${getEnv('GOOGLE_CLIENT_ID') ? 'Set' : 'Not set'}`);
      logger.info(`- GOOGLE_CLIENT_SECRET: ${getEnv('GOOGLE_CLIENT_SECRET') ? 'Set' : 'Not set'}`);
      logger.info(`- JWT_SECRET: ${getEnv('JWT_SECRET') ? 'Set' : 'Not set'}`);
      logger.info(`- SESSION_SECRET: ${getEnv('SESSION_SECRET') ? 'Set' : 'Not set'}`);
      logger.info(`- NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);

  try {
    // Close HTTP server
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });

    // Close database connection
    await closeDatabase();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
}

// Process error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  logger.info('Server will continue running...');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  logger.info('Server will continue running...');
});

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { httpServer, io, startServer };
