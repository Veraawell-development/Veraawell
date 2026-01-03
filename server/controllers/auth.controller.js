/**
 * Authentication Controller
 * Handles authentication route handlers
 */

const authService = require('../services/auth.service');
const emailService = require('../services/email.service');
const oauthService = require('../services/oauth.service');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AUTH-CONTROLLER');

/**
 * Register new user
 */
const register = asyncHandler(async (req, res) => {
  const user = await authService.registerUser(req.body);
  const token = authService.generateToken(user);
  authService.setAuthCookie(res, token);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    user: {
      username: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName
    },
    token // Send token to client for WebSocket auth (stored in memory)
  });
});

/**
 * Login user
 */
const login = asyncHandler(async (req, res) => {
  const { username, password, role } = req.body;
  const user = await authService.authenticateUser(username, password, role);
  const token = authService.generateToken(user);
  authService.setAuthCookie(res, token);

  res.json({
    success: true,
    message: 'Login successful',
    user: {
      userId: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName
    },
    token // Send token to client for WebSocket auth (stored in memory)
  });
});

/**
 * Logout user
 */
const logout = asyncHandler(async (req, res) => {
  // Set doctor offline if they're logging out
  // Note: req.user might not be set if called without auth, so check optional
  try {
    if (req.user && req.user.role === 'doctor') {
      req.user.isOnline = false;
      req.user.lastActiveAt = new Date();
      await req.user.save();
      logger.info('Doctor set offline on logout', { userId: req.user._id });
    }
  } catch (error) {
    logger.error('Error setting doctor offline', { error: error.message });
  }

  // Clear cookies
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  };

  res.clearCookie('token', cookieOptions);
  res.clearCookie('adminToken', cookieOptions);

  // Destroy session
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        logger.error('Session destroy error', { error: err.message });
      } else {
        logger.info('Session destroyed successfully');
      }
    });
  }

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * Request password reset
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  const result = await authService.requestPasswordReset(email);

  if (result) {
    await emailService.sendPasswordResetEmail(result.user, result.resetToken);
  }

  // Always return success message (don't reveal if user exists)
  res.json({
    success: true,
    message: 'Password reset instructions have been sent to your email.'
  });
});

/**
 * Reset password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  await authService.resetPassword(token, newPassword);

  res.json({
    success: true,
    message: 'Password reset successful. Please login with your new password.'
  });
});

/**
 * Get user profile
 */
const getProfile = asyncHandler(async (req, res) => {
  // req.user is already populated by verifyToken middleware
  const user = req.user;

  res.json({
    success: true,
    user: {
      userId: user._id,
      username: user.username || user.email,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      profileCompleted: user.profileCompleted
    }
  });
});

/**
 * Get protected route data
 */
const getProtected = asyncHandler(async (req, res) => {
  const user = req.user;

  res.json({
    success: true,
    message: 'Protected data',
    user: {
      userId: user._id,
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName
    },
    // Send token to client for WebSocket auth (stored in memory)
    token: req.cookies.token || null
  });
});

module.exports = {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  getProfile,
  getProtected
};
