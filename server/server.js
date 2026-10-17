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
        startScheduler(io);

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

// Render sends SIGTERM and waits 30 seconds before SIGKILL. Finishing inside
// that window with our own non-zero exit is better than being killed mid-write
// with no log line saying why.
const SHUTDOWN_TIMEOUT_MS = 10000;
let shuttingDown = false;

/**
 * Graceful shutdown handler
 *
 * Order matters: stop starting new work (scheduler jobs, socket events, HTTP
 * requests) before closing the database those would write to. This used to
 * close only the HTTP listener — without waiting for it — and then the
 * database, while the cron jobs and every open socket kept running against a
 * connection that was going away.
 */
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully...`);

  // A hung close (a socket that never drains, a database that never
  // answers) must not keep a dead instance holding the port.
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    try {
      const scheduler = require('./services/scheduler');
      if (typeof scheduler.stopScheduler === 'function') {
        scheduler.stopScheduler();
        logger.info('Scheduler stopped');
      }
    } catch (error) {
      logger.error('Could not stop the scheduler', { error: error.message });
    }

    // io.close() disconnects every socket and then closes the HTTP server it
    // is attached to, so the listener is closed exactly once, here.
    await new Promise((resolve) => {
      io.close((err) => {
        if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') {
          logger.warn('HTTP server close reported an error', { error: err.message });
        }
        resolve();
      });
    });
    logger.info('Socket.IO and HTTP server closed');

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
//
// An uncaught exception means some piece of state — a half-applied write, a
// lock never released, a socket handler midway through — is now unknown.
// This used to log "Server will continue running..." and do exactly that,
// serving requests from a process in a state nobody could describe. Exiting
// is the safe choice: Render restarts the service, and a clean process is
// better than a wrong one.
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception — exiting', { error: error.message, stack: error.stack });
  process.exit(1);
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

module.exports = { httpServer, io, startServer, gracefulShutdown };
