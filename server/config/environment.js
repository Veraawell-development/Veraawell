/**
 * Environment Configuration and Validation
 * Validates required environment variables on startup
 */

require('dotenv').config();
const { createLogger } = require('../utils/logger');

const logger = createLogger('ENV');

const requiredEnvVars = {
  production: [
    'MONGO_URI',
    'JWT_SECRET',
    'SESSION_SECRET',
    'FRONTEND_URL'
  ],
  development: [
    'MONGO_URI'
  ]
};

const optionalEnvVars = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'EMAIL_USER',
  'EMAIL_PASS',
  'ADMIN_JWT_SECRET',
  'PORT',
  'NODE_ENV'
];

/**
 * Validate environment variables
 * Should be called once at server startup (in server.js)
 */
function validateEnvironment() {
  const env = process.env.NODE_ENV || 'development';
  const required = requiredEnvVars[env] || requiredEnvVars.development;
  const missing = [];

  required.forEach((varName) => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });

  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    missing.forEach((varName) => {
      logger.error(`Missing: ${varName}`);
    });
    logger.error('Please set these variables in your .env file');
    logger.error('For development, only MONGO_URI is required.');
    logger.error('For production, MONGO_URI, JWT_SECRET, SESSION_SECRET, and FRONTEND_URL are required.');
    process.exit(1);
  }

  logger.info('Environment variables validated successfully');
}

/**
 * Get environment variable with optional default
 */
function getEnv(key, defaultValue = null) {
  return process.env[key] || defaultValue;
}

/**
 * Check if running in production
 */
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
function isDevelopment() {
  return process.env.NODE_ENV !== 'production';
}

module.exports = {
  validateEnvironment,
  getEnv,
  isProduction,
  isDevelopment,
  requiredEnvVars,
  optionalEnvVars
};
