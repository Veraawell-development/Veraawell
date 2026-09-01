/**
 * Environment Configuration and Validation
 * Validates required environment variables on startup
 */

require('dotenv').config();
const { createLogger } = require('../utils/logger');

const logger = createLogger('ENV');

// Anything listed here must be present or the process refuses to start.
//
// This list used to cover only MONGO_URI/JWT_SECRET/SESSION_SECRET/FRONTEND_URL,
// which left three classes of failure that startup validation did not catch:
//
//  - RAZORPAY_KEY_ID absent => the Razorpay SDK constructor throws
//    ("`key_id` or `oauthToken` is mandatory"). It was being constructed at
//    module load in three controllers that sit on app.js's require chain, so a
//    missing key was a hard boot crash with a stack trace from inside
//    node_modules rather than a clear "you forgot to set this" message.
//    (The client is lazy now — see services/razorpay.js — but payments are
//    core to this product, so booting without them configured is still wrong.)
//  - CLOUDINARY_* absent => config accepts undefined and the failure surfaces
//    as an auth error on a real user's first upload.
//  - RESEND absent => every transactional email (password reset, OTP, booking
//    confirmation) fails at send time, silently in some paths.
//
// ADMIN_JWT_SECRET is required because admin JWTs are signed with it; without
// it, getAdminJWTSecret() exits the process from inside a request handler.
const requiredEnvVars = {
  production: [
    'MONGO_URI',
    'JWT_SECRET',
    'SESSION_SECRET',
    'ADMIN_JWT_SECRET',
    'FRONTEND_URL',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'RESEND'
  ],
  development: [
    'MONGO_URI'
  ]
};

// Absent in development is fine; absent in production degrades a feature
// rather than breaking the app, so these warn instead of exiting.
const optionalEnvVars = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'EMAIL_USER',
  'EMAIL_PASS',
  'METERED_DOMAIN',
  'METERED_SECRET_KEY',
  'PORT',
  'NODE_ENV',
  'LOG_LEVEL',
  'LOG_VERBOSE'
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
    logger.error('Missing required environment variables — refusing to start', {
      environment: env,
      missing
    });
    missing.forEach((varName) => {
      logger.error(`  Missing: ${varName}`);
    });
    logger.error(`See server/example.env for the full list. Required in ${env}: ${required.join(', ')}`);
    process.exit(1);
  }

  // optionalEnvVars was declared but never read by any code path. Surfacing
  // absent optional config at boot is how you find out that (say) TURN relay
  // is unconfigured before a patient's video call silently fails to connect
  // behind a symmetric NAT, rather than after.
  const absentOptional = optionalEnvVars.filter((varName) => !process.env[varName]);
  if (absentOptional.length > 0) {
    logger.warn('Optional environment variables not set — related features are disabled', {
      absent: absentOptional
    });
  }

  logger.info('Environment variables validated successfully', { environment: env });
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
