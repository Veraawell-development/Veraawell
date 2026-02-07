/**
 * Authentication Service
 * Business logic for authentication operations
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { getJWTSecret, getCookieConfig } = require('../config/auth');
const { TOKEN_EXPIRY } = require('../config/constants');
const { AuthenticationError, AuthorizationError, NotFoundError, ConflictError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AUTH-SERVICE');

/**
 * Generate JWT token
 */
function generateToken(user) {
  const secret = getJWTSecret();
  const payload = {
    userId: user._id,
    username: user.username,
    role: user.role
  };

  return jwt.sign(payload, secret, { expiresIn: TOKEN_EXPIRY.ACCESS_TOKEN });
}

/**
 * Set authentication cookie
 */
function setAuthCookie(res, token) {
  const cookieConfig = getCookieConfig();
  res.cookie('token', token, cookieConfig);
}

/**
 * Register new user
 */
async function registerUser(userData) {
  const {
    firstName,
    lastName,
    email,
    password,
    role = 'patient',
    phoneNo,
    username,
    // Doctor-specific fields
    documents,
    specialization,
    licenseNumber,
    jobRole,
    professionalMessage
  } = userData;

  // FOR EMAIL/PASSWORD SIGNUP: Check OTP verification (skip for Google OAuth users)
  // Google OAuth users don't need OTP as Google verifies their email
  if (!userData.googleId) {
    const OTP = require('../models/otp');
    const otpRecord = await OTP.findOne({
      email: email.toLowerCase(),
      verified: true
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      logger.warn('Registration blocked - Email not verified', { email });
      throw new ConflictError('Email not verified. Please verify your email with OTP first.');
    }

    // Clean up verified OTP after successful check
    await OTP.deleteMany({ email: email.toLowerCase(), verified: true });
    logger.info('OTP verification passed, OTP records cleaned up', { email });
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ConflictError('User already exists');
  }

  // Create user with explicit approvalStatus
  const newUserData = {
    firstName: firstName.trim(),
    lastName: (lastName || '').trim(),
    email: email.toLowerCase().trim(),
    username: (username || email).toLowerCase().trim(),
    password,
    phoneNo: phoneNo || '',
    role,
    resetToken: null,
    resetTokenExpiry: null
  };

  // Add doctor-specific fields if role is doctor
  if (role === 'doctor') {
    newUserData.approvalStatus = 'pending';
    if (documents && Array.isArray(documents)) {
      newUserData.documents = documents;
    }
    if (specialization) {
      newUserData.specialization = specialization;
    }
    if (licenseNumber) {
      newUserData.licenseNumber = licenseNumber.trim();
    }
    if (jobRole) {
      newUserData.jobRole = jobRole.trim();
    }
    if (professionalMessage) {
      newUserData.professionalMessage = professionalMessage.trim();
    }
    logger.info('Doctor registration - setting approvalStatus to pending');
  } else {
    newUserData.approvalStatus = 'approved';
  }

  const newUser = new User(newUserData);
  await newUser.save();

  logger.info('User registered successfully', {
    userId: newUser._id.toString().substring(0, 8),
    email: newUser.email,
    role: newUser.role
  });

  return newUser;
}

/**
 * Authenticate user login
 */
async function authenticateUser(username, password, requestedRole = null) {
  // Find user by email or username
  const user = await User.findOne({
    $or: [
      { email: username.toLowerCase() },
      { username: username.toLowerCase() }
    ]
  });

  if (!user) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Check if Google user trying to login with password
  if (user.googleId) {
    throw new AuthenticationError('Please use Google Sign-In to log in');
  }

  // Check role mismatch
  if (requestedRole && requestedRole !== user.role) {
    throw new AuthenticationError(
      `You are registered as a ${user.role}. Please use the correct role to login.`,
      400
    );
  }

  // Check doctor approval status BEFORE password check
  if (user.role === 'doctor' && user.approvalStatus !== 'approved') {
    logger.warn('Doctor login blocked - not approved', {
      userId: user._id.toString().substring(0, 8),
      email: user.email,
      approvalStatus: user.approvalStatus,
      approvalStatusType: typeof user.approvalStatus,
      isApproved: user.approvalStatus === 'approved',
      strictCheck: user.approvalStatus !== 'approved'
    });

    if (user.approvalStatus === 'pending') {
      throw new AuthorizationError(
        'Your doctor account is pending approval. An admin will review your application soon.',
        403
      );
    } else if (user.approvalStatus === 'rejected') {
      throw new AuthorizationError(
        `Your doctor account has been rejected. Reason: ${user.rejectionReason || 'No reason provided'}`,
        403
      );
    }
    throw new AuthorizationError('Your doctor account requires approval before you can login.', 403);
  }

  // Log successful approval check for doctors
  if (user.role === 'doctor') {
    logger.info('Doctor approval check passed', {
      userId: user._id.toString().substring(0, 8),
      email: user.email,
      approvalStatus: user.approvalStatus
    });
  }

  // Verify password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Double-check approval status for doctors (redundant but safe)
  if (user.role === 'doctor' && user.approvalStatus !== 'approved') {
    if (user.approvalStatus === 'pending') {
      throw new AuthorizationError(
        'Your doctor account is pending approval. An admin will review your application soon.',
        403
      );
    } else if (user.approvalStatus === 'rejected') {
      throw new AuthorizationError(
        `Your doctor account has been rejected. Reason: ${user.rejectionReason || 'No reason provided'}`,
        403
      );
    }
  }

  logger.info('User authenticated successfully', {
    userId: user._id.toString().substring(0, 8),
    email: user.email,
    role: user.role
  });

  return user;
}

/**
 * Handle password reset request
 */
async function requestPasswordReset(email) {
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    // Don't reveal if user exists or not (security best practice)
    return null;
  }

  if (user.googleId) {
    throw new AuthenticationError('This account uses Google login. Please use Google Sign-In.');
  }

  // Clear any existing reset token
  await user.clearResetToken();

  // Initialize new reset token
  const resetToken = await user.initializeResetToken();

  logger.info('Password reset token generated', {
    email: user.email,
    hasToken: !!user.resetToken,
    tokenExpiry: user.resetTokenExpiry
  });

  return { user, resetToken };
}

/**
 * Reset password with token
 */
async function resetPassword(token, newPassword) {
  const user = await User.findOne({ resetToken: token });

  if (!user) {
    throw new NotFoundError('Invalid reset token. Please request a new password reset.');
  }

  if (!user.isResetActive) {
    await user.clearResetToken();
    throw new AuthenticationError('Reset token has expired. Please request a new password reset.');
  }

  if (user.googleId) {
    throw new AuthenticationError('You signed up with Google. Please use Google Sign-In to log in.');
  }

  // Verify the new password is different from the current one
  const isSamePassword = await user.comparePassword(newPassword);
  if (isSamePassword) {
    throw new AuthenticationError('New password must be different from your current password');
  }

  // Update password
  await user.updatePassword(newPassword);

  logger.info('Password reset successful', {
    email: user.email
  });

  return user;
}

/**
 * Get user profile
 */
async function getUserProfile(userId) {
  const user = await User.findById(userId).select('-password -resetToken -resetTokenExpiry');

  if (!user) {
    throw new NotFoundError('User');
  }

  return user;
}

module.exports = {
  generateToken,
  setAuthCookie,
  registerUser,
  authenticateUser,
  requestPasswordReset,
  resetPassword,
  getUserProfile
};
