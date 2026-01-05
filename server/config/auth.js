/**
 * Authentication Configuration
 * JWT secrets, OAuth settings, and cookie configuration
 */

const crypto = require('crypto');
const { getEnv, isProduction } = require('./environment');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AUTH-CONFIG');

// Note: validateEnvironment() should be called in server.js at startup, not here
// Calling it here causes issues when the module is imported before env vars are ready

/**
 * Get JWT secret - FAIL if not set (no fallback in production)
 */
function getJWTSecret() {
  const secret = getEnv('JWT_SECRET');

  if (!secret) {
    if (isProduction()) {
      logger.error('JWT_SECRET is required in production!');
      process.exit(1);
    }
    // Only allow fallback in development
    logger.warn('JWT_SECRET not set, using development fallback');
    return 'veraawell_jwt_secret_key_2024_development_environment_secure_token_generation';
  }

  return secret;
}

/**
 * Get Admin JWT secret
 */
function getAdminJWTSecret() {
  const secret = getEnv('ADMIN_JWT_SECRET');

  if (!secret) {
    if (isProduction()) {
      logger.error('ADMIN_JWT_SECRET is required in production!');
      process.exit(1);
    }
    // Use same secret as regular JWT in development if not set
    return getJWTSecret();
  }

  return secret;
}

/**
 * Get session secret
 */
function getSessionSecret() {
  const secret = getEnv('SESSION_SECRET');

  if (!secret) {
    if (isProduction()) {
      // Generate random secret in production if not set (not ideal but better than crash)
      logger.warn('SESSION_SECRET not set, generating random secret');
      return crypto.randomBytes(64).toString('hex');
    }
    // Generate random secret in development
    return crypto.randomBytes(64).toString('hex');
  }

  return secret;
}

/**
 * Get OAuth configuration
 */
function getOAuthConfig() {
  const clientId = getEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');

  return {
    enabled: !!(clientId && clientSecret),
    clientId,
    clientSecret
  };
}

/**
 * Get cookie configuration
 */
function getCookieConfig() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    domain: undefined, // No domain restriction for cross-origin (Vercel <-> Render)
    path: '/'
  };
}

/**
 * Get session cookie configuration
 */
function getSessionCookieConfig() {
  return {
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    domain: undefined // No domain restriction for cross-origin (Vercel <-> Render)
  };
}

/**
 * Get frontend URL
 */
function getFrontendUrl() {
  return getEnv('FRONTEND_URL', isProduction()
    ? 'https://veraawell.com'
    : 'http://localhost:5173'
  );
}

module.exports = {
  getJWTSecret,
  getAdminJWTSecret,
  getSessionSecret,
  getOAuthConfig,
  getCookieConfig,
  getSessionCookieConfig,
  getFrontendUrl
};
