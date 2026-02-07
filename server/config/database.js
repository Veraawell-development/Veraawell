/**
 * Database Configuration
 * MongoDB connection and session store setup
 */

const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const { getEnv, isProduction } = require('./environment');
const { createLogger } = require('../utils/logger');
const User = require('../models/user');

const logger = createLogger('DATABASE');

let isMongoConnected = false;

/**
 * Connect to MongoDB
 */
async function connectDatabase() {
  const mongoUri = getEnv('MONGO_URI');

  // Mask credentials in URI for logging
  const maskedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');

  logger.info('Attempting to connect to MongoDB', {
    uri: maskedUri,
    hasUri: !!mongoUri,
    uriLength: mongoUri ? mongoUri.length : 0
  });

  try {
    logger.info('Mongoose connection options', {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true,
      retryReads: true
    });

    logger.info('Initiating mongoose.connect()...');
    const startTime = Date.now();

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout for server selection
      socketTimeoutMS: 45000, // 45 seconds socket timeout
      maxPoolSize: 10, // Maximum number of connections in the pool
      retryWrites: true, // Enable retryable writes
      retryReads: true, // Enable retryable reads
    });

    const connectionTime = Date.now() - startTime;
    isMongoConnected = true;

    logger.info('MongoDB connected successfully', {
      connectionTime: `${connectionTime}ms`,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    });

    // Run migration to fix reset tokens
    try {
      logger.info('Starting reset token migration...');
      const migrationStartTime = Date.now();
      const migratedCount = await User.migrateResetTokens();
      const migrationTime = Date.now() - migrationStartTime;
      logger.info('Migration completed', {
        migratedCount,
        duration: `${migrationTime}ms`
      });

      // Verify migration
      try {
        const inconsistentUsers = await User.find({
          $or: [
            { resetToken: { $exists: false } },
            { resetTokenExpiry: { $exists: false } },
            { resetToken: null },
            { resetTokenExpiry: { $ne: null, $lt: new Date() } },
            { resetToken: { $ne: '' }, resetTokenExpiry: null },
            { resetToken: '', resetTokenExpiry: { $ne: null } }
          ]
        });

        if (inconsistentUsers.length > 0) {
          logger.warn('Found users with inconsistent reset tokens after migration', {
            count: inconsistentUsers.length,
            userIds: inconsistentUsers.slice(0, 5).map(u => u._id.toString())
          });
        } else {
          logger.info('All users have consistent reset token state');
        }
      } catch (verificationError) {
        logger.warn('Could not verify migration results', {
          error: verificationError.message,
          errorName: verificationError.name,
          errorStack: verificationError.stack
        });
      }
    } catch (error) {
      logger.error('Migration failed', {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack
      });
      logger.warn('Continuing server startup despite migration failure...');
    }

    return mongoose.connection;
  } catch (error) {
    isMongoConnected = false;

    // Detailed error logging
    logger.error('MongoDB connection failed', {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      errorStack: error.stack,
      readyState: mongoose.connection.readyState,
      uri: maskedUri
    });

    // Log specific error types
    if (error.name === 'MongoServerSelectionError') {
      logger.error('Server selection error details', {
        reason: error.reason ? error.reason.message : 'Unknown',
        servers: error.reason ? error.reason.servers : []
      });
    }

    if (error.name === 'MongoNetworkError' || error.code === 'ECONNREFUSED') {
      logger.error('Network connection error', {
        message: 'Cannot reach MongoDB server. Check:',
        checks: [
          '1. Network connectivity',
          '2. MongoDB Atlas IP whitelist',
          '3. Firewall/VPN settings',
          '4. DNS resolution',
          '5. Connection string format'
        ]
      });
    }

    if (error.message && error.message.includes('querySrv')) {
      logger.error('DNS SRV record resolution failed', {
        message: 'Cannot resolve MongoDB SRV records. Check:',
        checks: [
          '1. DNS server configuration',
          '2. Network DNS resolution',
          '3. MongoDB cluster hostname is correct',
          '4. Cluster exists and is not paused in MongoDB Atlas'
        ]
      });
    }

    logger.warn('Connection troubleshooting', {
      uriProvided: !!mongoUri,
      uriFormat: mongoUri ? (mongoUri.startsWith('mongodb+srv://') ? 'SRV' : 'Standard') : 'None',
      suggestion: 'Please verify MONGO_URI in .env file and MongoDB Atlas cluster status'
    });

    throw error;
  }
}

/**
 * Create MongoDB session store
 */
function createSessionStore() {
  const mongoUri = getEnv('MONGO_URI', 'mongodb://localhost:27017/veraawell');
  const sessionSecret = getEnv('SESSION_SECRET');

  // If no session secret, generate one (should not happen after validation, but safe fallback)
  const secret = sessionSecret || require('crypto').randomBytes(64).toString('hex');

  return MongoStore.create({
    mongoUrl: mongoUri,
    ttl: 30 * 24 * 60 * 60, // 30 days in seconds
    touchAfter: 24 * 3600, // Lazy session update (24 hours)
    crypto: {
      secret: secret
    }
  });
}

/**
 * Close database connection
 */
async function closeDatabase() {
  try {
    logger.info('Closing MongoDB connection...', {
      readyState: mongoose.connection.readyState,
      isConnected: isMongoConnected
    });

    await mongoose.connection.close();
    isMongoConnected = false;

    logger.info('MongoDB connection closed successfully', {
      readyState: mongoose.connection.readyState
    });
  } catch (error) {
    logger.error('Error closing MongoDB connection', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      readyState: mongoose.connection.readyState
    });
    throw error;
  }
}

/**
 * Get connection status
 */
function isConnected() {
  return isMongoConnected && mongoose.connection.readyState === 1;
}

// Monitor connection status
mongoose.connection.on('connected', () => {
  isMongoConnected = true;
  logger.info('MongoDB connection event: connected', {
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name
  });
});

mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  logger.warn('MongoDB connection event: disconnected', {
    readyState: mongoose.connection.readyState,
    timestamp: new Date().toISOString()
  });
});

mongoose.connection.on('error', (err) => {
  isMongoConnected = false;
  logger.error('MongoDB connection event: error', {
    errorName: err.name,
    errorMessage: err.message,
    errorCode: err.code,
    readyState: mongoose.connection.readyState,
    timestamp: new Date().toISOString()
  });
});

mongoose.connection.on('reconnected', () => {
  isMongoConnected = true;
  logger.info('MongoDB connection event: reconnected', {
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    timestamp: new Date().toISOString()
  });
});

mongoose.connection.on('connecting', () => {
  logger.info('MongoDB connection event: connecting', {
    readyState: mongoose.connection.readyState,
    timestamp: new Date().toISOString()
  });
});

module.exports = {
  connectDatabase,
  createSessionStore,
  closeDatabase,
  isConnected
};
