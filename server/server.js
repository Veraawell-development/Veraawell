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

// Initialize all Socket.IO handlers via bootstrapper
const { initializeSockets } = require('./socket');
initializeSockets(io);

// Make io available to app if needed
app.set('io', io);

const PORT = getEnv('PORT', 8000);

/**
 * Start the server
 */
async function startServer() {
  try {
    // Start HTTP server immediately to avoid Render port binding timeout
    httpServer.listen(PORT, '0.0.0.0', async () => {
      const env = process.env.NODE_ENV || 'development';
      
      try {
        const CFonts = require('cfonts');
        CFonts.say('VERAAWELL', {
          font: 'block', 
          align: 'left',
          colors: ['green', 'cyan'],
          background: 'transparent',
          letterSpacing: 0,
          lineHeight: 1,
          space: true,
          maxLength: '0',
          gradient: ['white', 'white'],
          independentGradient: false,
          transitionGradient: true,
          env: 'node'
        });
        console.log(`  \x1b[32m\x1b[1m⚡ Core API engineered by Abhigyan (IIIT Delhi '27) ⚡\x1b[0m\n`);
      } catch (err) {
        // Fallback if cfonts fails
        console.log(`  VERAAWELL Core API - Engineered by Abhigyan (IIIT Delhi '27)\n`);
      }
      logger.info('--------------------------------------------------');
      logger.info(`  Veraawell API Server`);
      logger.info(`  Port     : ${PORT}`);
      logger.info(`  Env      : ${env}`);
      logger.info(`  Sockets  : Enabled (WebSocket + polling)`);
      logger.info('--------------------------------------------------');

      try {
        // Connect to database
        await connectDatabase();
        logger.info('  DB       : Connected');

        // Reset all doctor statuses to offline on startup to clear stale records
        // Removed auto-offline on startup as per user request.
        // Doctors stay online until they manually toggle off or log out.

        // Start scheduler (session reminders, status updates)
        const { startScheduler } = require('./services/scheduler');
        startScheduler();

      } catch (dbError) {
        logger.error('Failed to connect to database or initialize services', { error: dbError.message });
        // We don't exit here so the server stays alive and Render doesn't restart it constantly,
        // but API calls will fail until DB is fixed.
      }
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
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? reason.stack : reason,
    promise
  });
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
