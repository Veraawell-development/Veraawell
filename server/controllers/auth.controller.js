/**
 * Authentication Controller
 * Handles authentication route handlers
 */

const authService = require('../services/auth.service');
const emailService = require('../services/email.service');
const oauthService = require('../services/oauth.service');
const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../middleware/error.middleware');
const { AppError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const { generateOTP, hashOTP, verifyOTP } = require('../utils/otpGenerator');
const { isValidPassword } = require('../middleware/validation.middleware');

const { MAX_SIGNUP_OTP_ATTEMPTS, MAX_SIGNUP_OTP_RESENDS } = authService;

const logger = createLogger('AUTH-CONTROLLER');

/**
 * Email a signup code, or fail the request in a way the person can act on.
 *
 * This is the one email that is not best-effort: without it the account
 * cannot be verified. Before the mail helper checked Resend's `error`, a
 * failed send was indistinguishable from a sent one, so signup answered
 * "check your email" for codes that never left.
 */
async function sendSignupCode(email, otp, role) {
  try {
    await emailService.sendOTPEmail(email, otp, role);
  } catch (error) {
    logger.error('Signup code could not be sent', { email, error: error.message });
    throw new AppError('We could not send your verification code. Please try again in a few minutes.', 502);
  }
}

const RESENDS_EXHAUSTED = Object.freeze({
  success: false,
  message: 'Too many verification codes have been requested for this signup. Please wait 15 minutes and register again.',
  maxResendsReached: true
});

/**
 * Replace a pending signup's code and email the new one. Returns false,
 * without sending anything, once the signup has used its resend budget.
 *
 * Each new code resets the per-code attempt counter, so issuing them has to
 * be capped too. Uncapped — as the login path used to be — it was unlimited
 * guessing: five wrong codes, ask for another, five more, forever, and every
 * new code also pushed createdAt forward so the 15-minute TTL never arrived.
 * The login path and the "Resend code" button share this budget.
 */
async function issueReplacementCode(pendingUser) {
  if ((pendingUser.resendCount || 0) >= MAX_SIGNUP_OTP_RESENDS) return false;

  // Store only the hash; the plaintext exists just long enough to email.
  const otp = generateOTP();
  pendingUser.otp = await hashOTP(otp);
  pendingUser.attempts = 0;
  pendingUser.resendCount = (pendingUser.resendCount || 0) + 1;
  // createdAt is the TTL field; restarting it gives the new code its full 15
  // minutes. Bounded by the cap above.
  pendingUser.createdAt = new Date();
  await pendingUser.save();

  await sendSignupCode(pendingUser.email, otp, pendingUser.role);
  return true;
}

/**
 * POST /api/auth/resend-signup-otp — the "Resend code" button.
 *
 * Answers the same for an address with no signup in progress as for one
 * with, so it cannot be used to discover who is registering. The two
 * refusals it does make are the per-signup resend cap (here) and the
 * email+IP rate limit in front of it (app.js).
 */
const RESEND_RESPONSE = Object.freeze({
  success: true,
  message: 'If a signup is waiting for verification at that address, a new code is on its way.'
});

const resendSignupOtp = asyncHandler(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  const PendingUser = require('../models/pendingUser');
  const pendingUser = await PendingUser.findOne({ email });
  if (!pendingUser) {
    return res.json(RESEND_RESPONSE);
  }

  if (!(await issueReplacementCode(pendingUser))) {
    return res.status(429).json(RESENDS_EXHAUSTED);
  }

  res.json(RESEND_RESPONSE);
});

/**
 * Register new user
 */
const register = asyncHandler(async (req, res) => {
  const pendingUser = await authService.registerUser(req.body);

  // Send OTP Email via Resend — pendingUser.otp is now a bcrypt hash, never the
  // real code; the plaintext is only ever available transiently right here.
  // If it cannot be sent the pending row goes too: the request failed, and a
  // row nobody holds a code for would only route their next login into
  // "verify your email".
  try {
    await sendSignupCode(pendingUser.email, pendingUser.plainOtp, pendingUser.role);
  } catch (error) {
    const PendingUser = require('../models/pendingUser');
    await PendingUser.deleteOne({ _id: pendingUser._id });
    throw error;
  }

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
      const identifier = String(username).trim().toLowerCase();
      const pendingUser = await PendingUser.findOne({ $or: [{ email: identifier }, { username: identifier }] });

      // Only the person who registered may ask for a new code. This used to
      // skip the password entirely, so anyone who knew an address that was
      // mid-signup could make the server mail it a fresh code on demand.
      const ownsSignup = pendingUser && typeof password === 'string'
        && await bcrypt.compare(password, pendingUser.password);

      if (ownsSignup) {
        if (!(await issueReplacementCode(pendingUser))) {
          return res.status(429).json({
            ...RESENDS_EXHAUSTED,
            requiresVerification: true,
            email: pendingUser.email
          });
        }

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
      emergencyContact: user.emergencyContact || { name: null, phone: null, relationship: null }
    },
    token // Send token to client for WebSocket auth (stored in memory)
  });
});

/**
 * Verify Signup OTP
 */
const verifySignup = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (typeof email !== 'string' || !email || otp === undefined || otp === null || otp === '') {
    return res.status(400).json({ success: false, message: 'Email and OTP are required' });
  }

  const PendingUser = require('../models/pendingUser');
  const normalizedEmail = email.trim().toLowerCase();
  const pendingUser = await PendingUser.findOne({ email: normalizedEmail });

  if (!pendingUser) {
    // Check if they are already a verified User
    const User = require('../models/user');
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User is already verified' });
    }
    return res.status(404).json({ success: false, message: 'OTP expired or user not found. Please register again.' });
  }

  if (pendingUser.attempts >= MAX_SIGNUP_OTP_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'Too many incorrect attempts. Please register again to receive a new code.',
      maxAttemptsReached: true
    });
  }

  const isValid = await verifyOTP(otp, pendingUser.otp);
  if (!isValid) {
    pendingUser.attempts += 1;
    await pendingUser.save();
    const attemptsLeft = MAX_SIGNUP_OTP_ATTEMPTS - pendingUser.attempts;
    return res.status(400).json({ success: false, message: 'Invalid verification code', attemptsLeft: Math.max(0, attemptsLeft) });
  }

  // Verified successfully - Transfer to real User
  const User = require('../models/user');
  const newUser = new User({
    firstName: pendingUser.firstName,
    lastName: pendingUser.lastName,
    email: pendingUser.email,
    username: pendingUser.username,
    password: pendingUser.password, // Already hashed in PendingUser — flagged below so the hook skips it
    role: pendingUser.role,
    phoneNumber: pendingUser.phoneNumber,
    approvalStatus: pendingUser.approvalStatus,
    ...(pendingUser.doctorDetails || {}),
    isVerified: true
  });
  
  newUser.$locals.passwordIsHashed = true;
  await newUser.save();
  await PendingUser.deleteOne({ _id: pendingUser._id });

  // An admin applicant is verified but not yet an admin: a super admin has to
  // approve them, and they sign in at /admin-login, in the admin realm. This
  // used to hand them a 30-day USER-realm session the moment they verified.
  if (newUser.role === 'admin') {
    return res.json({
      success: true,
      requiresApproval: true,
      message: 'Email verified. A super admin will review your request — you will get an email when you can sign in.'
    });
  }

  // The same for a practitioner applicant. They were handed a 30-day
  // session cookie here, silently — the careers page tells them to sign in
  // once approved — so their next visit to /login dropped them straight into
  // the doctor dashboard while still unapproved, and once they signed out the
  // login page refused them as "pending approval". No session until an admin
  // approves; the approval email tells them to sign in.
  if (newUser.role === 'doctor' && newUser.approvalStatus !== 'approved') {
    return res.json({
      success: true,
      requiresApproval: true,
      message: 'Email verified. Our team will review your application — you will get an email when you can sign in.'
    });
  }

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
      emergencyContact: { name: null, phone: null, relationship: null }
    },
    token
  });
});

/**
 * Logout user
 */
const logout = asyncHandler(async (req, res) => {
  // Signing out needs no valid session (optionalAuth on the route). A
  // token that had already expired, or been retired by a password change,
  // used to make this a 401 that left the dead cookie in the browser.

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

  // Clear the user session's cookie only. This also cleared `adminToken`, so
  // signing out of a patient account in one tab signed the same person out of
  // the admin dashboard in another — two realms, one logout.
  authService.clearAuthCookie(res);

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * Request password reset
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';

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
    // Log internally but never expose to the client. The reason is logged
    // too: "no such account" and "the reset email could not be sent" are
    // very different things to find in the logs.
    logger.warn('Password reset not sent', { reason: e.message });
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
      emergencyContact: user.emergencyContact || { name: null, phone: null, relationship: null }
    },
    // Send token to client for WebSocket auth (stored in memory). The one
    // that actually authenticated this request: the cookie used to be echoed
    // back even when it was a stale one the Bearer header had been preferred
    // over, and the client then adopted the stale token as its own.
    token: req.authToken || null
  });
});

/**
 * Error handler for GET /api/protected: a session the server refuses —
 * expired, retired by a password change, account suspended or not approved —
 * has its cookie cleared before the error goes on to the error middleware.
 * Anything else (a database outage) leaves the cookie alone: that session
 * may be perfectly good.
 */
function clearRefusedSession(err, req, res, next) {
  if (err && (err.statusCode === 401 || err.statusCode === 403)) {
    authService.clearAuthCookie(res);
  }
  next(err);
}

/**
 * Update password
 */
const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user._id;

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Please provide both current and new passwords' });
  }

  // The same rule registration and reset apply. This route applied none, so
  // a one-character password was accepted here.
  const strength = isValidPassword(newPassword);
  if (!strength.valid) {
    return res.status(400).json({ success: false, message: strength.message, errors: { newPassword: strength.message } });
  }

  await authService.updatePassword(userId, currentPassword, newPassword);

  // The change stamps passwordChangedAt, which retires every token issued
  // before it — that is the point: a stolen session ends when the password
  // does. The session making the change is the one exception, so it gets a
  // fresh token rather than being logged out by its own request.
  const token = authService.generateToken(req.user);
  authService.setAuthCookie(res, token);

  res.json({
    success: true,
    message: 'Password updated successfully',
    token
  });
});

/**
 * Delete account
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  await authService.deleteAccount(userId);

  // Clear cookie and log out. This was a bare clearCookie('token'), which in
  // production targets the API host while the cookie lives on .veraawell.com
  // — the account was gone but the browser kept presenting its token.
  authService.clearAuthCookie(res);

  res.json({
    success: true,
    message: 'Account deleted successfully'
  });
});

module.exports = {
  register,
  login,
  verifySignup,
  resendSignupOtp,
  logout,
  forgotPassword,
  resetPassword,
  getProfile,
  getProtected,
  clearRefusedSession,
  updatePassword,
  deleteAccount
};
