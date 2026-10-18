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
      // This used to generate a random secret and continue with only a warning.
      // That is not "better than a crash" — it is a crash deferred and made
      // invisible:
      //   - every process restart invalidates every existing session, so users
      //     are silently logged out on each deploy;
      //   - two instances generate two different keys, so a session created on
      //     one is undecryptable on the other (connect-mongo encrypts session
      //     payloads with this secret) — it makes horizontal scaling
      //     impossible in a way that presents as random logouts;
      //   - the failure is indistinguishable from correct operation in logs.
      // A missing signing key is a configuration error. Fail closed.
      logger.error('SESSION_SECRET is required in production!');
      process.exit(1);
    }
    // Development only: an ephemeral secret is fine, and the warning explains
    // why sessions do not survive a restart locally.
    logger.warn('SESSION_SECRET not set, using an ephemeral development secret (sessions will not survive a restart)');
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
    secure: isProduction(), // Secure only in production (HTTPS)
    sameSite: isProduction() ? 'none' : 'lax', // 'none' requires secure: true
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
    domain: isProduction() ? '.veraawell.com' : undefined
  };
}

/**
 * The admin cookie. Host-only (no domain) and short-lived: admin tokens last
 * 1-8 hours, and nothing outside the API host needs to see this one.
 *
 * It used to be spelled out by hand at each of the three places that set or
 * cleared it, and the logout copy had drifted (no sameSite, no secure), which
 * is exactly how a cookie ends up never actually being cleared.
 */
function getAdminCookieConfig(maxAgeMs = 60 * 60 * 1000) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/'
  };
}

/**
 * Options for res.clearCookie that match how the cookie was SET.
 *
 * A browser only removes a cookie when the clearing Set-Cookie names the same
 * domain and path; in production the auth cookie is scoped to
 * `.veraawell.com`, and a bare res.clearCookie('token') targets the API host
 * instead, so it cleared nothing and "delete account" left the session alive.
 * maxAge is stripped because Express 4 lets it override the immediate expiry
 * clearCookie sets — passing the set-time config straight through would
 * re-issue the cookie for another 30 days.
 */
function toClearOptions(config) {
  const { maxAge, expires, ...rest } = config;
  return rest;
}

/**
 * Get session cookie configuration
 */
function getSessionCookieConfig() {
  return {
    httpOnly: true,
    // Secure only where there is HTTPS. express-session refuses to set a
    // Secure cookie on a plain-http request, so locally the Google round trip
    // lost its session — and with it the state check — every time.
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    // Sessions only carry a Google sign-in across Google's redirect (auth is
    // the JWT cookie), which takes minutes, not the 30 days this was. Each
    // click on the Google button left a 30-day row in auth_sessions.
    maxAge: 15 * 60 * 1000,
    path: '/',
    domain: isProduction() ? '.veraawell.com' : undefined
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
  getAdminCookieConfig,
  toClearOptions,
  getSessionCookieConfig,
  getFrontendUrl
};
