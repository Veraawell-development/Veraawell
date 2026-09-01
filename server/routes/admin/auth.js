const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../../models/user');
const { verifyAdminToken, verifySuperAdmin } = require('../../middleware/auth.middleware');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { authLimiter } = require('../../middleware/rateLimit.middleware');
const { isProduction } = require('../../config/environment');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('ADMIN-AUTH');

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'development.veraawell@gmail.com',
    pass: process.env.EMAIL_PASS
  }
});

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
    const email = process.env.INITIAL_ADMIN_EMAIL;
    if (!email) {
      return res.status(500).json({ message: 'INITIAL_ADMIN_EMAIL must be set in the environment to run first-time setup' });
    }
    // A hardcoded password here (there used to be one, 'Admin@123') would be
    // committed to source control and publicly known — anyone who can reach
    // this endpoint before an admin exists (fresh deploy, DB reset, staging)
    // would get a fully privileged account with a published password. Use an
    // explicit env-provided password if set, otherwise generate a one-time
    // random password and surface it only in the server log, never in the
    // HTTP response.
    const tempPassword = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(12).toString('hex');

    const adminData = {
      email,
      password: tempPassword,
      firstName: 'Super',
      lastName: 'Admin'
    };

    const admin = await User.createFirstAdmin(adminData);
    await admin.logActivity('account_created', { isFirstAdmin: true });

    if (!process.env.INITIAL_ADMIN_PASSWORD) {
      logger.warn('First super admin created with a generated one-time password — rotate it immediately after first login', {
        email: admin.email,
        tempPassword
      });
    }

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
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const admin = await User.findOne({ email: email.toLowerCase(), role: { $in: ['admin', 'super_admin'] } });

    if (!admin) {
      return res.status(404).json({ message: 'No admin account found with this email' });
    }

    // Clear any existing reset token
    await admin.clearResetToken();

    // Generate new reset token
    const resetToken = await admin.initializeResetToken();

    // Create reset URL
    const frontendBaseUrl = process.env.NODE_ENV === 'production'
      ? 'https://veraawell.vercel.app'
      : 'http://localhost:5173';
    const resetUrl = `${frontendBaseUrl}/admin/reset-password/${resetToken}`;

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_USER || 'development.veraawell@gmail.com',
      to: admin.email,
      subject: 'Admin Password Reset Request',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a1a; margin-bottom: 10px;">Password Reset Request</h1>
            <p style="color: #666; margin-bottom: 20px;">Admin Portal - VeraAwell</p>
          </div>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin-bottom: 20px; color: #333;">Hello ${admin.firstName},</p>
            <p style="margin-bottom: 20px; color: #333;">We received a request to reset your admin account password. Click the button below to proceed:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #666; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email or contact support if you're concerned.</p>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px;">
            <p>VeraAwell Admin System</p>
            <p>This is a secure system email. Please do not reply.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    await admin.logActivity('password_reset_requested', { timestamp: new Date() });

    // The reset token used to be logged in full and returned in the response
    // body whenever NODE_ENV === 'development'. If NODE_ENV is ever
    // misconfigured in a shared/staging environment (an easy real-world
    // mistake), that handed out account-takeover tokens directly through the
    // API response and server logs. The token is delivered exclusively via
    // the emailed link now.
    logger.info('Password reset requested for admin', { email: admin.email });

    res.json({ message: 'Password reset instructions sent to your email' });
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

    if (!password) {
      return res.status(400).json({ message: 'New password is required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const admin = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
      role: { $in: ['admin', 'super_admin'] }
    });

    if (!admin) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Update password and clear reset token
    admin.password = password;
    await admin.clearResetToken();
    await admin.logActivity('password_reset_completed', { timestamp: new Date() });

    // Log for debugging
    logger.info('Password reset completed for admin', { email: admin.email });

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    logger.error('Reset password error', { error: error.message });
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// Admin login route — this is the most privileged login path in the app
// (super-admin master password + regular admin login), so it gets the auth
// rate limiter applied directly rather than relying on any outer wiring.
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // SUPER ADMIN LOGIN (from ENV) — constant-time comparison. A plain `===`
    // string comparison short-circuits on the first differing byte, which is
    // a measurable timing side-channel on the single most privileged
    // credential in the system.
    const suppliedIdBuf = Buffer.from((email || '').toLowerCase());
    const expectedIdBuf = Buffer.from(process.env.ADMIN_ID || '');
    const suppliedPwBuf = Buffer.from(password || '');
    const expectedPwBuf = Buffer.from(process.env.ADMIN_PASSWORD || '');
    const idMatches = !!process.env.ADMIN_ID
      && suppliedIdBuf.length === expectedIdBuf.length
      && crypto.timingSafeEqual(suppliedIdBuf, expectedIdBuf);
    const pwMatches = !!process.env.ADMIN_PASSWORD
      && suppliedPwBuf.length === expectedPwBuf.length
      && crypto.timingSafeEqual(suppliedPwBuf, expectedPwBuf);

    if (idMatches && pwMatches) {
      // Check if super admin exists in database
      let superAdmin = await User.findOne({ email: process.env.ADMIN_ID, role: 'super_admin' });

      // Create super admin if doesn't exist
      if (!superAdmin) {
        superAdmin = new User({
          email: process.env.ADMIN_ID,
          username: 'superadmin',
          password: process.env.ADMIN_PASSWORD,
          firstName: 'Super',
          lastName: 'Admin',
          role: 'super_admin',
          approvalStatus: 'approved',
          profileCompleted: true
        });
        await superAdmin.save();
        logger.info('Super admin created automatically');
      }

      // Create token for super admin
      const token = jwt.sign(
        { userId: superAdmin._id, role: 'super_admin' },
        process.env.ADMIN_JWT_SECRET,
        { expiresIn: '8h' }
      );

      logger.info('Super admin token generated');

      // Set cookie
      res.cookie('adminToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 28800000 // 8 hours
      });

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

    // Find admin
    logger.info('Admin login attempt', { email: email.toLowerCase() });
    const admin = await User.findOne({ email: email.toLowerCase(), role: { $in: ['admin', 'super_admin'] } });
    
    if (!admin) {
      logger.warn('Admin not found', { email: email.toLowerCase() });
      
      // Check if user exists with a different role to give better feedback
      const anyUser = await User.findOne({ email: email.toLowerCase() });
      if (anyUser) {
        logger.warn('User found with a different role', { role: anyUser.role });
        return res.status(403).json({ message: `Account found but it is registered as a ${anyUser.role}, not an admin.` });
      }
      
      return res.status(404).json({ message: 'Account not found. Please register as an admin first.' });
    }

    logger.info('Admin found', { role: admin.role, approvalStatus: admin.approvalStatus });

    // Check if admin is approved (only for regular admins, not super_admin)
    // We check this BEFORE password to give better feedback to pending admins as requested
    if (admin.role === 'admin' && admin.approvalStatus !== 'approved') {
      logger.warn('Admin not approved', { approvalStatus: admin.approvalStatus });
      if (admin.approvalStatus === 'pending') {
        return res.status(403).json({ message: 'Your account is pending approval. Please wait for super admin to approve your request.' });
      } else if (admin.approvalStatus === 'rejected') {
        return res.status(403).json({ message: 'Your account has been rejected. Reason: ' + (admin.rejectionReason || 'No reason provided') });
      }
    }

    // Check password
    logger.debug('Checking admin password', { email: email.toLowerCase() });
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      logger.warn('Admin password mismatch', { email: email.toLowerCase() });
      return res.status(401).json({ message: 'Invalid password' });
    }

    logger.info('Admin password match successful');

    // Check if admin is active
    if (admin.status !== 'active') {
      logger.warn('Admin account suspended', { email: email.toLowerCase() });
      return res.status(403).json({ message: 'Account is suspended' });
    }

    // Create token
    const token = jwt.sign(
      { userId: admin._id, role: admin.role },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Set cookie
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 3600000 // 1 hour
    });

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

    // Verify current password
    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Update password
    admin.password = newPassword;
    admin.isPasswordChanged = true;
    await admin.save();

    // Log activity
    await admin.logActivity('password_change', { timestamp: new Date() });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Password change error', { error: error.message });
    res.status(500).json({ message: 'Failed to update password' });
  }
});

// Create new admin (super admin only)
router.post('/create', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const { email, firstName, lastName, role } = req.body;

    // Generate temporary password
    const tempPassword = crypto.randomBytes(8).toString('hex');

    // Create admin
    const newAdmin = new User({
      email,
      password: tempPassword,
      firstName,
      lastName,
      role: role || 'admin'
    });

    await newAdmin.save();

    // Send credentials via email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: newAdmin.email,
      subject: 'Your Veraawell Admin Account',
      html: `
        <h2>Your Admin Account Has Been Created</h2>
        <p>Email: ${newAdmin.email}</p>
        <p>Temporary Password: ${tempPassword}</p>
        <p>Please change your password upon first login.</p>
      `
    });

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
router.post('/logout', verifyAdminToken, async (req, res) => {
  try {
    // Log activity before clearing cookie
    await req.admin.logActivity('logout', { timestamp: new Date() });

    // Clear admin token cookie
    res.cookie('adminToken', '', {
      httpOnly: true,
      expires: new Date(0)
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({ message: 'Logout failed' });
  }
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