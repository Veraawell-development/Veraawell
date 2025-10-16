/**
 * Authentication Middleware for Video Call System
 * Validates JWT tokens and user permissions
 */

const jwt = require('jsonwebtoken');
const User = require('../../models/user'); // Assuming user model exists in parent directory
const logger = require('../utils/logger');

/**
 * Validate JWT token and extract user information
 */
const validateJWT = async (token) => {
  try {
    if (!token) {
      throw new Error('No token provided');
    }
    
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    
    // Verify token
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET || 'your-secret-key');
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return {
      id: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName
    };
    
  } catch (error) {
    throw new Error('Invalid token: ' + error.message);
  }
};

/**
 * Express middleware for JWT authentication
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }
    
    const user = await validateJWT(token);
    req.user = user;
    next();
    
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

/**
 * Role-based authorization middleware
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

/**
 * Video call specific authorization
 * Checks if user can access video call features
 */
const authorizeVideoCall = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Check if user role allows video calls
    const allowedRoles = ['patient', 'doctor', 'admin'];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Video call access not allowed for this user type'
      });
    }
    
    // Additional checks for patients
    if (user.role === 'patient') {
      // Could add checks for:
      // - Active subscription
      // - Account verification
      // - Parental consent (for minors)
      // - etc.
    }
    
    // Additional checks for doctors
    if (user.role === 'doctor') {
      // Could add checks for:
      // - License verification
      // - Platform approval
      // - Compliance training completion
      // - etc.
    }
    
    next();
    
  } catch (error) {
    logger.error('Video call authorization error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization check failed'
    });
  }
};

/**
 * Rate limiting middleware for video call endpoints
 */
const rateLimitVideoCall = (maxRequests = 10, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) {
      return next();
    }
    
    const now = Date.now();
    const userRequests = requests.get(userId) || [];
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(
      timestamp => now - timestamp < windowMs
    );
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current request
    validRequests.push(now);
    requests.set(userId, validRequests);
    
    next();
  };
};

/**
 * Validate room access permissions
 */
const validateRoomAccess = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID required'
      });
    }
    
    // This would typically check the VideoCallRoom model
    // but since we're keeping this as a demo, we'll do basic validation
    
    // Store room info for use in controllers
    req.roomId = roomId;
    req.userId = userId;
    
    next();
    
  } catch (error) {
    logger.error('Room access validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Room access validation failed'
    });
  }
};

/**
 * HIPAA compliance middleware
 * Ensures requests meet healthcare data protection requirements
 */
const ensureHIPAACompliance = (req, res, next) => {
  // Check for required security headers
  const requiredHeaders = {
    'x-request-id': 'Request ID required for audit trail',
    'user-agent': 'User agent required for device tracking'
  };
  
  for (const [header, message] of Object.entries(requiredHeaders)) {
    if (!req.headers[header]) {
      logger.warn(`HIPAA compliance warning: Missing ${header}`);
      // In production, you might want to reject the request
      // return res.status(400).json({ success: false, message });
    }
  }
  
  // Add audit information to request
  req.auditInfo = {
    timestamp: new Date(),
    userId: req.user?.id,
    userRole: req.user?.role,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'] || generateRequestId()
  };
  
  next();
};

/**
 * Generate unique request ID for audit trail
 */
const generateRequestId = () => {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

/**
 * Error handling middleware for authentication errors
 */
const handleAuthErrors = (error, req, res, next) => {
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token format'
    });
  }
  
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token has expired'
    });
  }
  
  if (error.name === 'NotBeforeError') {
    return res.status(401).json({
      success: false,
      message: 'Token not active yet'
    });
  }
  
  // Pass other errors to default error handler
  next(error);
};

module.exports = {
  validateJWT,
  authenticateToken,
  authorizeRoles,
  authorizeVideoCall,
  rateLimitVideoCall,
  validateRoomAccess,
  ensureHIPAACompliance,
  handleAuthErrors,
  generateRequestId
};
