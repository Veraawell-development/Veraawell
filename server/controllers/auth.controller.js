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
  const pendingUser = await authService.registerUser(req.body);

  // Send OTP Email via Resend
  await emailService.sendOTPEmail(pendingUser.email, pendingUser.otp, pendingUser.role);

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please verify your email.',
    requiresVerification: true,
    email: pendingUser.email
  });
});

/**
 * Login user
 */
const login = asyncHandler(async (req, res) => {
  const { username, password, role } = req.body;
  const PendingUser = require('../models/pendingUser');
  let user;
  
  try {
    user = await authService.authenticateUser(username, password, role);
  } catch (error) {
    if (error.name === 'AuthenticationError' && error.message.includes('User not found')) {
      // Check if they are in pending state
      const pendingUser = await PendingUser.findOne({ $or: [{ email: username.toLowerCase() }, { username: username.toLowerCase() }] });
      if (pendingUser) {
        // Generate new OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        pendingUser.otp = otp;
        // TTL extends automatically if we save? Wait, createdAt is what TTL uses. We should update createdAt.
        pendingUser.createdAt = new Date();
        await pendingUser.save();
        
        await emailService.sendOTPEmail(pendingUser.email, otp, pendingUser.role);
        
        return res.status(403).json({
          success: false,
          message: 'Please verify your email first. A new OTP has been sent.',
          requiresVerification: true,
          email: pendingUser.email
        });
      }
    }
    throw error;
  }

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
      lastName: user.lastName,
      emergencyContact: user.emergencyContact || { name: null, phone: null }
    },
    token // Send token to client for WebSocket auth (stored in memory)
  });
});

/**
 * Verify Signup OTP
 */
const verifySignup = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: 'Email and OTP are required' });
  }

  const PendingUser = require('../models/pendingUser');
  const pendingUser = await PendingUser.findOne({ email: email.toLowerCase() });
  
  if (!pendingUser) {
    // Check if they are already a verified User
    const User = require('../models/user');
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User is already verified' });
    }
    return res.status(404).json({ success: false, message: 'OTP expired or user not found. Please register again.' });
  }

  if (pendingUser.otp !== otp) {
    return res.status(400).json({ success: false, message: 'Invalid verification code' });
  }

  // Verified successfully - Transfer to real User
  const User = require('../models/user');
  const newUser = new User({
    firstName: pendingUser.firstName,
    lastName: pendingUser.lastName,
    email: pendingUser.email,
    username: pendingUser.username,
    password: pendingUser.password, // Already hashed in PendingUser, hook will skip
    role: pendingUser.role,
    phoneNumber: pendingUser.phoneNumber,
    approvalStatus: pendingUser.approvalStatus,
    ...(pendingUser.doctorDetails || {}),
    isVerified: true
  });
  
  await newUser.save();
  await PendingUser.deleteOne({ _id: pendingUser._id });

  const token = authService.generateToken(newUser);
  authService.setAuthCookie(res, token);

  res.json({
    success: true,
    message: 'Email verified successfully',
    user: {
      userId: newUser._id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      emergencyContact: { name: null, phone: null }
    },
    token
  });
});

/**
 * Logout user
 */
const logout = asyncHandler(async (req, res) => {
  // Set doctor offline if they're logging out
  try {
    if (req.user && req.user.role === 'doctor') {
      const { updateDoctorStatus } = require('../services/doctorStatus.service');
      const io = req.app.get('io');
      await updateDoctorStatus(req.user._id, false, io);
    }
  } catch (error) {
    logger.error('Error setting doctor offline on logout', { error: error.message });
  }

  // Clear cookies
  const { getCookieConfig } = require('../config/auth');
  const cookieConfig = getCookieConfig();
  
  const clearOptionsWithDomain = {
    httpOnly: cookieConfig.httpOnly,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    path: cookieConfig.path,
    domain: cookieConfig.domain
  };

  const clearOptionsWithoutDomain = {
    httpOnly: cookieConfig.httpOnly,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    path: cookieConfig.path
  };

  res.clearCookie('token', clearOptionsWithDomain);
  res.clearCookie('adminToken', clearOptionsWithoutDomain);

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

  // Silently attempt reset — never reveal whether email exists
  try {
    const result = await authService.requestPasswordReset(email);
    if (result) {
      await emailService.sendPasswordResetEmail(result.user, result.resetToken);
    }
  } catch (e) {
    // Log internally but never expose to the client
    logger.warn('Forgot password attempt for unknown/invalid email', { email });
  }

  // Always return the same success message (security: prevents email enumeration)
  res.json({
    success: true,
    message: 'If this email is registered, you will receive a reset link shortly.'
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
      lastName: user.lastName,
      emergencyContact: user.emergencyContact || { name: null, phone: null }
    },
    // Send token to client for WebSocket auth (stored in memory)
    token: req.cookies.token || null
  });
});

/**
 * Update password
 */
const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user._id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Please provide both current and new passwords' });
  }

  await authService.updatePassword(userId, currentPassword, newPassword);

  res.json({
    success: true,
    message: 'Password updated successfully'
  });
});

/**
 * Delete account
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  await authService.deleteAccount(userId);

  // Clear cookie and log out
  res.clearCookie('token');

  res.json({
    success: true,
    message: 'Account deleted successfully'
  });
});

module.exports = {
  register,
  login,
  verifySignup,
  logout,
  forgotPassword,
  resetPassword,
  getProfile,
  getProtected,
  updatePassword,
  deleteAccount
};
