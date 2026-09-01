/**
 * Authentication Middleware
 * Centralized JWT token verification for all routes
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { getJWTSecret, getAdminJWTSecret } = require('../config/auth');
const { AuthenticationError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const { normalizeActor, CHANNEL } = require('../authz/actor');

const logger = createLogger('AUTH');

/**
 * Extract token from request (cookie or Authorization header)
 */
function extractToken(req) {
  // Check cookies first
  let token = null;
  let tokenSource = null;

  // Check Authorization header first (highest priority)
  if (req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      tokenSource = 'header:Authorization';
      logger.debug('Token extracted from Authorization header', {
        source: tokenSource,
        tokenPreview: token.substring(0, 20) + '...'
      });
      return token;
    }
  }

  // If no header, check cookies.
  // Guarded: `req.cookies` is undefined unless cookieParser has run. Reading
  // through it unguarded turned "no credentials" into a 500 with a stack
  // trace instead of a 401, and made every authenticated route depend on
  // middleware ordering that nothing asserted.
  const cookies = req.cookies || {};
  token = cookies.token || cookies.adminToken;

  if (token) {
    tokenSource = cookies.token ? 'cookie:token' : 'cookie:adminToken';
    logger.debug('Token extracted from cookie', {
      source: tokenSource,
      tokenPreview: token.substring(0, 20) + '...'
    });
  } else {
    logger.debug('No token found in request', {
      hasCookies: !!req.cookies,
      hasAuthHeader: !!req.headers.authorization
    });
  }

  return token;
}

/**
 * Determine which secret to use based on token type
 */
function getSecretForToken(req, token) {
  // If adminToken cookie exists, use admin secret
  if (req.cookies && req.cookies.adminToken) {
    return getAdminJWTSecret();
  }

  // Otherwise use regular JWT secret
  return getJWTSecret();
}

/**
 * Verify JWT token and attach user to request
 */
async function verifyToken(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      logger.warn('No token provided', { ip: req.ip });
      throw new AuthenticationError('No token provided');
    }

    // Determine which secret to use
    const secret = getSecretForToken(req, token);

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (error) {
      logger.warn('Token verification failed', { error: error.message });
      throw new AuthenticationError('Invalid or expired token');
    }

    // Find user in database
    let user;
    if (decoded.userId) {
      user = await User.findById(decoded.userId);
    } else if (decoded.username) {
      // Legacy token format - find by username
      user = await User.findOne({ username: decoded.username });
    }

    if (!user) {
      logger.warn('User not found for token', { userId: decoded.userId });
      throw new AuthenticationError('User not found');
    }

    // Account status was never checked here, only in verifyAdminToken. So
    // suspending a patient or doctor did nothing at all: their existing token
    // kept full access for its 30-day life, and they could continue booking,
    // messaging and joining calls. Verified against the running server — a
    // user with status 'suspended' got HTTP 200 from /api/protected.
    if (user.status !== 'active') {
      logger.warn('Suspended account attempted access', {
        userId: user._id.toString().substring(0, 8),
        status: user.status
      });
      throw new AuthorizationError('This account has been suspended');
    }

    // Attach user to request
    req.user = user;
    req.token = decoded;
    // Single normalized view of the caller, correct in both auth realms. See
    // authz/actor.js — handlers read req.actor.id rather than guessing
    // between req.user and req.admin.
    req.actor = normalizeActor(user, CHANNEL.USER);

    logger.debug('Token verified successfully', {
      userId: user._id.toString().substring(0, 8) + '...',
      role: user.role
      // Never log full token or sensitive data
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Verify admin token
 */
async function verifyAdminToken(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new AuthenticationError('Admin authentication required');
    }

    const secret = getAdminJWTSecret();
    const decoded = jwt.verify(token, secret);

    const admin = await User.findById(decoded.userId);
    if (!admin) {
      throw new AuthenticationError('Admin not found');
    }

    if (admin.status !== 'active') {
      throw new AuthorizationError('Admin account is suspended');
    }

    // The role is taken from the DATABASE, not from the JWT claim.
    //
    // Previously the claim alone decided this, so demoting an admin had no
    // effect until their token expired — up to 8 hours of retained privilege
    // after the revocation was supposed to take effect. The claim is now only
    // a hint; a disagreement means the token predates a role change.
    if (!['admin', 'super_admin'].includes(admin.role)) {
      logger.warn('Admin token presented by a non-admin account', {
        claimedRole: decoded.role, actualRole: admin.role
      });
      throw new AuthorizationError('Access denied');
    }
    if (decoded.role !== admin.role) {
      logger.warn('Admin role claim differs from the stored role — using the stored role', {
        claimedRole: decoded.role, actualRole: admin.role
      });
    }

    req.admin = admin;
    req.token = decoded;
    req.actor = normalizeActor(admin, CHANNEL.ADMIN);

    logger.debug('Admin token verified', {
      adminId: admin._id.toString().substring(0, 8),
      role: admin.role
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Verify super admin role (must be used after verifyAdminToken)
 *
 * Tagged so authz/audit.js counts it as a declared authorization requirement.
 * It predates the policy layer but it genuinely states one, and treating it as
 * "undeclared" would overstate the gap.
 */
function verifySuperAdmin(req, res, next) {
  if (!req.admin || req.admin.role !== 'super_admin') {
    throw new AuthorizationError('Super admin privileges required');
  }
  next();
}
verifySuperAdmin.__authz = { kind: 'role', roles: ['super_admin'], legacy: true };

/**
 * Optional token verification (doesn't fail if no token)
 */
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (token) {
      const secret = getSecretForToken(req, token);
      const decoded = jwt.verify(token, secret);

      if (decoded.userId) {
        const user = await User.findById(decoded.userId);
        // A suspended account is treated as anonymous here rather than as an
        // error, since this middleware is for endpoints that work either way.
        if (user && user.status === 'active') {
          req.user = user;
          req.token = decoded;
          req.actor = normalizeActor(user, CHANNEL.USER);
        }
      }
    }

    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
}

/**
 * Verify specific role
 */
function requireRole(...roles) {
  const middleware = (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AuthorizationError('Insufficient permissions'));
    }
    next();
  };
  middleware.__authz = { kind: 'role', roles, legacy: true };
  return middleware;
}

module.exports = {
  verifyToken,
  verifyAdminToken,
  verifySuperAdmin,
  requireRole,
  optionalAuth,
  extractToken
};

