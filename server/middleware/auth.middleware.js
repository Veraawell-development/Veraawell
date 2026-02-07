/**
 * Authentication Middleware
 * Centralized JWT token verification for all routes
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { getJWTSecret, getAdminJWTSecret } = require('../config/auth');
const { AuthenticationError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

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

  // If no header, check cookies
  token = req.cookies.token || req.cookies.adminToken;

  if (token) {
    tokenSource = req.cookies.token ? 'cookie:token' : 'cookie:adminToken';
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
  if (req.cookies.adminToken) {
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

    // Attach user to request
    req.user = user;
    req.token = decoded;

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

    // Check for admin roles
    if (!decoded.role || !['admin', 'super_admin'].includes(decoded.role)) {
      logger.warn('Invalid admin role', { role: decoded.role });
      throw new AuthorizationError('Access denied');
    }

    // Find admin
    const admin = await User.findById(decoded.userId);
    if (!admin) {
      throw new AuthenticationError('Admin not found');
    }

    // Check if admin is active
    if (admin.status !== 'active') {
      throw new AuthorizationError('Admin account is suspended');
    }

    req.admin = admin;
    req.token = decoded;

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
 */
function verifySuperAdmin(req, res, next) {
  if (!req.admin || req.admin.role !== 'super_admin') {
    throw new AuthorizationError('Super admin privileges required');
  }
  next();
}

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
        if (user) {
          req.user = user;
          req.token = decoded;
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
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AuthorizationError('Insufficient permissions'));
    }
    next();
  };
}

module.exports = {
  verifyToken,
  verifyAdminToken,
  verifySuperAdmin,
  requireRole,
  optionalAuth,
  extractToken
};

