const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../models/user');
const { verifyAdminToken, verifySuperAdmin } = require('../../middleware/auth.middleware');
const { authLimiter, passwordResetLimiter } = require('../../middleware/rateLimit.middleware');
const { getAdminJWTSecret, getAdminCookieConfig, toClearOptions, getFrontendUrl } = require('../../config/auth');
const emailService = require('../../services/email.service');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('ADMIN-AUTH');

const SUPER_ADMIN_TOKEN_HOURS = 8;
const ADMIN_TOKEN_HOURS = 1;
const MIN_ADMIN_PASSWORD_LENGTH = 8;

/**
 * Sign an admin-realm token and set the matching cookie.
 *
 * Signing used to read process.env.ADMIN_JWT_SECRET directly, while
 * verifyAdminToken verifies with getAdminJWTSecret(). Outside production
 * those differ whenever ADMIN_JWT_SECRET is unset (the getter falls back to
 * JWT_SECRET; jwt.sign with an undefined key throws), so local admin login
 * 500'd. One getter on both sides.
 */
function issueAdminSession(res, admin, hours) {
  const token = jwt.sign(
    { userId: admin._id, role: admin.role },
    getAdminJWTSecret(),
    { expiresIn: `${hours}h` }
  );
  res.cookie('adminToken', token, getAdminCookieConfig(hours * 60 * 60 * 1000));
  return token;
}

/**
 * The env-configured master identity, normalized the same way stored emails
 * are. ADMIN_ID used to be compared byte-for-byte against a lowercased input,
 * so an ADMIN_ID with any capital letter could never match; and the row it
 * auto-creates is stored lowercased by the schema, so the lookup after it
 * missed too and the next login tried to create a duplicate.
 */
function masterAdminId() {
  return (process.env.ADMIN_ID || '').trim().toLowerCase();
}

function timingSafeMatch(supplied, expected) {
  const a = Buffer.from(String(supplied || ''));
  const b = Buffer.from(String(expected || ''));
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A password no one knows, for accounts that must not be password-login-able. */
function unusablePassword() {
  return crypto.randomBytes(32).toString('hex');
}

// First-time setup route (no auth required)
const checkFirstTimeSetup = async (req, res, next) => {
  try {
    const adminCount = await User.countDocuments({ role: { $in: ['admin', 'super_admin'] } });
    if (adminCount > 0) {
      return res.status(403).json({ message: 'Setup already completed' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

router.post('/setup', authLimiter, checkFirstTimeSetup, async (req, res) => {
  try {
    const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
    // Both come from the environment. A hardcoded password here (there used
    // to be one, 'Admin@123') would be committed to source control and
    // publicly known. The fallback after that generated a random password
    // and wrote it to the server log — which is a credential in a log store
    // that more people can read than should hold a super-admin password.
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!email || !password) {
      return res.status(500).json({ message: 'INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set in the environment to run first-time setup' });
    }

    // `username` is required and unique on User. Setup never set it, so this
    // endpoint failed validation and returned 500 on every call it was
    // allowed to make.
    const admin = await User.createFirstAdmin({
      email,
      username: email,
      password,
      firstName: 'Super',
      lastName: 'Admin'
    });
    await admin.logActivity('account_created', { isFirstAdmin: true });

    res.json({
      message: 'Super admin account created successfully',
      email: admin.email
    });
  } catch (error) {
    logger.error('Setup error', { error: error.message });
    res.status(500).json({ message: 'Failed to create super admin account' });
  }
});

// Forgot password route
//
// One response for every outcome. It used to answer 404 "No admin account
// found with this email" — an oracle for which addresses hold admin accounts,
// on the most privileged login in the app, with no rate limit in front of it.
const FORGOT_PASSWORD_RESPONSE = { message: 'If that address belongs to an admin account, a reset link is on its way.' };

router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const admin = await User.findOne({ email, role: { $in: ['admin', 'super_admin'] } });

    // The master account signs in only with the environment credential (see
    // /login), so a reset link for it would set a password nothing accepts.
    if (!admin || (masterAdminId() && admin.email === masterAdminId())) {
      logger.info('Admin password reset requested for an address with no resettable admin account');
      return res.json(FORGOT_PASSWORD_RESPONSE);
    }

    // Clear any existing reset token
    await admin.clearResetToken();

    // Generate new reset token
    const resetToken = await admin.initializeResetToken();

    // The frontend base comes from config like every other link. It was
    // hardcoded to the Vercel preview host, so production admins were sent
    // to a different deployment to reset their password.
    const resetUrl = `${getFrontendUrl()}/admin/reset-password/${resetToken}`;

    try {
      await emailService.sendAdminPasswordResetEmail(admin, resetUrl);
    } catch (mailError) {
      // Logged, not surfaced: a different response here would reintroduce
      // the enumeration oracle above.
      logger.error('Admin password reset email failed', { error: mailError.message });
    }
    await admin.logActivity('password_reset_requested', { timestamp: new Date() });

    // The reset token used to be logged in full and returned in the response
    // body whenever NODE_ENV === 'development'. If NODE_ENV is ever
    // misconfigured in a shared/staging environment (an easy real-world
    // mistake), that handed out account-takeover tokens directly through the
    // API response and server logs. The token is delivered exclusively via
    // the emailed link now.
    logger.info('Password reset requested for admin', { email: admin.email });

    res.json(FORGOT_PASSWORD_RESPONSE);
  } catch (error) {
    logger.error('Forgot password error', { error: error.message });
    res.status(500).json({ message: 'Failed to process password reset request' });
  }
});

// Reset password route
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'New password is required' });
    }

    if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters long` });
    }

    const admin = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
      role: { $in: ['admin', 'super_admin'] }
    });

    if (!admin) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Update password and clear reset token. The save stamps
    // passwordChangedAt, which retires every admin token issued before now.
    admin.password = password;
    await admin.clearResetToken();
    await admin.logActivity('password_reset_completed', { timestamp: new Date() });

    logger.info('Password reset completed for admin', { email: admin.email });

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    logger.error('Reset password error', { error: error.message });
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

/**
 * The master credential: ADMIN_ID / ADMIN_PASSWORD from the environment.
 *
 * Its database row exists only so the session has a user to hang off. It is
 * created with a password nobody knows, and the regular login path below
 * refuses it, so the environment variable is the ONLY credential. Before,
 * the row was created with a bcrypt copy of ADMIN_PASSWORD and was also
 * accepted by the regular path — so rotating ADMIN_PASSWORD after a leak left
 * the leaked value working indefinitely through the database copy.
 */
async function masterLogin(res) {
  const adminId = masterAdminId();
  // By email alone: a filter on role too missed an existing non-admin account
  // with this email, and the create below then hit the unique email index — a
  // 500 on every master login, with nothing to say why.
  let superAdmin = await User.findOne({ email: adminId });
  if (superAdmin && superAdmin.role !== 'super_admin') {
    logger.error('ADMIN_ID belongs to a non-admin account; refusing master login', { role: superAdmin.role });
    return res.status(409).json({
      message: 'The master admin email is already used by another account. Set ADMIN_ID to an address no user has registered with.'
    });
  }

  if (!superAdmin) {
    superAdmin = new User({
      email: adminId,
      username: adminId,
      password: unusablePassword(),
      firstName: 'Super',
      lastName: 'Admin',
      role: 'super_admin',
      approvalStatus: 'approved',
      profileCompleted: true
    });
    await superAdmin.save();
    logger.info('Super admin created automatically');
  } else if (await superAdmin.comparePassword(process.env.ADMIN_PASSWORD)) {
    // A row created by the old code still holds a usable copy of the master
    // password. Replace it once; after this the comparison fails and costs
    // nothing but the hash check.
    superAdmin.password = unusablePassword();
    await superAdmin.save();
    logger.info('Replaced the stored copy of the master password on the super admin row');
  }

  const token = issueAdminSession(res, superAdmin, SUPER_ADMIN_TOKEN_HOURS);
  logger.info('Super admin token generated');

  return res.json({
    message: 'Super admin login successful',
    token: token,  // Added for frontend localStorage
    admin: {
      id: superAdmin._id,
      email: superAdmin.email,
      role: 'super_admin',
      firstName: superAdmin.firstName,
      lastName: superAdmin.lastName,
      requiresPasswordChange: false
    }
  });
}

// One message for "no such admin" and "wrong password", so this endpoint
// cannot be used to discover which addresses hold admin accounts.
const BAD_CREDENTIALS = { message: 'Invalid email or password' };

// Admin login route — this is the most privileged login path in the app
// (super-admin master password + regular admin login), so it gets the auth
// rate limiter applied directly rather than relying on any outer wiring.
router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { password } = req.body;

    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // SUPER ADMIN LOGIN (from ENV) — constant-time comparison. A plain `===`
    // string comparison short-circuits on the first differing byte, which is
    // a measurable timing side-channel on the single most privileged
    // credential in the system.
    const idMatches = timingSafeMatch(email, masterAdminId());
    const pwMatches = timingSafeMatch(password, process.env.ADMIN_PASSWORD);

    if (idMatches && pwMatches) {
      return masterLogin(res);
    }

    // The master account never authenticates against its stored hash.
    if (idMatches) {
      logger.warn('Master admin login with a wrong password');
      return res.status(401).json(BAD_CREDENTIALS);
    }

    logger.info('Admin login attempt', { email });
    const admin = await User.findOne({ email, role: { $in: ['admin', 'super_admin'] } });

    // Nothing about the account — that it exists, its role, whether it is
    // approved, why it was rejected — is said before the password checks
    // out. This used to answer "registered as a patient, not an admin" and
    // read out the rejection reason to anyone who typed the address.
    if (!admin || !(await admin.comparePassword(password))) {
      logger.warn('Admin login refused: bad credentials', { email });
      return res.status(401).json(BAD_CREDENTIALS);
    }

    if (admin.status !== 'active') {
      logger.warn('Admin account suspended', { email });
      return res.status(403).json({ message: 'Account is suspended' });
    }

    // Approval applies to regular admins; a super admin is approved by
    // construction.
    if (admin.role === 'admin' && admin.approvalStatus !== 'approved') {
      logger.warn('Admin not approved', { approvalStatus: admin.approvalStatus });
      if (admin.approvalStatus === 'rejected') {
        return res.status(403).json({ message: 'Your account has been rejected. Reason: ' + (admin.rejectionReason || 'No reason provided') });
      }
      return res.status(403).json({ message: 'Your account is pending approval. Please wait for super admin to approve your request.' });
    }

    // By role: a super admin signing in here got 1 hour, but 8 through the
    // master login or after changing their password.
    const token = issueAdminSession(res, admin, admin.role === 'super_admin' ? SUPER_ADMIN_TOKEN_HOURS : ADMIN_TOKEN_HOURS);

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Log activity
    await admin.logActivity('login', { timestamp: new Date() });

    res.json({
      message: 'Login successful',
      token: token,  // Added for frontend localStorage
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
        firstName: admin.firstName,
        lastName: admin.lastName,
        requiresPasswordChange: !admin.isPasswordChanged
      }
    });
  } catch (error) {
    logger.error('Admin login error', { error: error.message });
    res.status(500).json({ message: 'Login failed' });
  }
});

// Change password route
router.post('/change-password', verifyAdminToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = req.admin;

    if (typeof newPassword !== 'string' || newPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `New password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters long` });
    }

    // Verify current password
    const isMatch = typeof currentPassword === 'string' && await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Update password. The save stamps passwordChangedAt, which retires every
    // admin token issued before it — including the one on this request — so
    // this session is re-issued below rather than logged out by its own
    // password change.
    admin.password = newPassword;
    admin.isPasswordChanged = true;
    await admin.save();

    // Log activity
    await admin.logActivity('password_change', { timestamp: new Date() });

    const hours = admin.role === 'super_admin' ? SUPER_ADMIN_TOKEN_HOURS : ADMIN_TOKEN_HOURS;
    const token = issueAdminSession(res, admin, hours);

    res.json({ message: 'Password updated successfully', token });
  } catch (error) {
    logger.error('Password change error', { error: error.message });
    res.status(500).json({ message: 'Failed to update password' });
  }
});

// Create new admin (super admin only)
router.post('/create', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { firstName, lastName, role } = req.body;

    if (!email || !firstName) {
      return res.status(400).json({ message: 'Email and first name are required' });
    }

    // This endpoint creates admins. It used to take `role` from the body
    // unchecked, so a super admin's dashboard request — or anything able to
    // ride one — could mint further super admins, or a 'doctor' that skipped
    // review entirely.
    if (role !== undefined && role !== 'admin') {
      return res.status(400).json({ message: 'Only admin accounts can be created here' });
    }

    const existing = await User.findOne({ $or: [{ email }, { username: email }] }).select('_id');
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const tempPassword = crypto.randomBytes(12).toString('hex');

    // `username` is required on User and was never set, so this endpoint
    // failed validation on every call. An admin created by a super admin is
    // approved by that act — leaving it 'pending' (the schema default for
    // role 'admin') meant it could not sign in until someone approved the
    // account they had just created.
    const newAdmin = new User({
      email,
      username: email,
      password: tempPassword,
      firstName,
      lastName: lastName || '',
      role: 'admin',
      approvalStatus: 'approved',
      approvedBy: req.admin._id,
      approvedAt: new Date(),
      isVerified: true,
      isPasswordChanged: false
    });

    await newAdmin.save();

    // The emailed password is the only copy that exists — it is deliberately
    // never logged. If it cannot be delivered the account is unusable, so it
    // is removed rather than left behind with a password nobody has.
    try {
      await emailService.sendAdminCredentialsEmail(newAdmin.email, tempPassword);
    } catch (mailError) {
      await User.deleteOne({ _id: newAdmin._id });
      logger.error('Admin credentials email failed; account rolled back', { error: mailError.message });
      return res.status(502).json({ message: 'The credentials email could not be sent, so the admin was not created. Please try again.' });
    }

    // Log activity
    await req.admin.logActivity('create_admin', {
      newAdminId: newAdmin._id,
      newAdminEmail: newAdmin.email
    });

    res.status(201).json({
      message: 'Admin created successfully. Credentials sent via email.'
    });
  } catch (error) {
    logger.error('Create admin error', { error: error.message });
    res.status(500).json({ message: 'Failed to create admin account' });
  }
});

// Logout route
//
// Works without a valid session. It used to sit behind verifyAdminToken, so
// an admin whose token had expired, or who had been suspended or demoted,
// got a 401/403 and the cookie was never cleared — logout failed for exactly
// the people most in need of it. The activity log is written when the token
// still identifies someone.
router.post('/logout', async (req, res) => {
  try {
    const { extractToken } = require('../../middleware/auth.middleware');
    const token = (req.cookies && req.cookies.adminToken) || extractToken(req);
    if (token) {
      try {
        const decoded = jwt.verify(token, getAdminJWTSecret());
        const admin = await User.findById(decoded.userId);
        if (admin) await admin.logActivity('logout', { timestamp: new Date() });
      } catch (e) {
        // An expired or invalid token still gets its cookie cleared.
      }
    }
  } catch (error) {
    logger.warn('Logout activity log failed', { error: error.message });
  }

  // Cleared with the attributes it was set with. The old clear omitted
  // secure/sameSite, which a browser can treat as a different cookie.
  res.clearCookie('adminToken', toClearOptions(getAdminCookieConfig()));
  res.json({ message: 'Logged out successfully' });
});


// Get admin status
router.get('/status', verifyAdminToken, async (req, res) => {
  try {
    const admin = req.admin;
    res.json({
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
        firstName: admin.firstName,
        lastName: admin.lastName
      }
    });
  } catch (error) {
    logger.error('Status check error', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
