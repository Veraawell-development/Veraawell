const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../../models/user');
const { verifyAdminToken, verifySuperAdmin } = require('../../middleware/auth.middleware');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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

router.post('/setup', checkFirstTimeSetup, async (req, res) => {
  try {
    const adminData = {
      email: 'development.veraawell@gmail.com',
      password: 'Admin@123',
      firstName: 'Super',
      lastName: 'Admin'
    };

    const admin = await User.createFirstAdmin(adminData);
    await admin.logActivity('account_created', { isFirstAdmin: true });

    res.json({
      message: 'Super admin account created successfully',
      email: admin.email
    });
  } catch (error) {
    console.error('Setup error:', error);
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

    // Log for debugging
    console.log(`Reset token generated for admin ${admin.email}:`, resetToken);
    console.log('Reset token expiry:', admin.resetTokenExpiry);

    res.json({
      message: 'Password reset instructions sent to your email',
      debug: process.env.NODE_ENV === 'development' ? { resetToken } : undefined
    });
  } catch (error) {
    console.error('Forgot password error:', error);
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
    console.log(`Password reset completed for admin ${admin.email}`);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// Admin login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // HARDCODED SUPER ADMIN LOGIN
    if (email.toLowerCase() === 'admin@gmail.com' && password === 'admin@123') {
      // Check if super admin exists in database
      let superAdmin = await User.findOne({ email: 'admin@gmail.com', role: 'super_admin' });

      // Create super admin if doesn't exist
      if (!superAdmin) {
        superAdmin = new User({
          email: 'admin@gmail.com',
          username: 'superadmin',
          password: 'admin@123',
          firstName: 'Super',
          lastName: 'Admin',
          role: 'super_admin',
          approvalStatus: 'approved',
          profileCompleted: true
        });
        await superAdmin.save();
        console.log('Super admin created automatically');
      }

      // Create token for super admin
      const token = jwt.sign(
        { userId: superAdmin._id, role: 'super_admin' },
        process.env.ADMIN_JWT_SECRET,
        { expiresIn: '8h' }
      );

      console.log('[ADMIN LOGIN] Super admin token generated:', token.substring(0, 30) + '...');
      console.log('[ADMIN LOGIN] Token will be sent in response body and cookie');

      // Set cookie
      res.cookie('adminToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 28800000 // 8 hours
      });

      console.log('[ADMIN LOGIN] Cookie set successfully');

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
    const admin = await User.findOne({ email: email.toLowerCase(), role: { $in: ['admin', 'super_admin'] } });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if admin is active
    if (admin.status !== 'active') {
      return res.status(403).json({ message: 'Account is suspended' });
    }

    // Check if admin is approved (only for regular admins, not super_admin)
    if (admin.role === 'admin' && admin.approvalStatus !== 'approved') {
      if (admin.approvalStatus === 'pending') {
        return res.status(403).json({ message: 'Your account is pending approval. Please wait for super admin to approve your request.' });
      } else if (admin.approvalStatus === 'rejected') {
        return res.status(403).json({ message: 'Your account has been rejected. Reason: ' + (admin.rejectionReason || 'No reason provided') });
      }
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
    console.error('Admin login error:', error);
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
    console.error('Password change error:', error);
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
    console.error('Create admin error:', error);
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
    console.error('Logout error:', error);
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
    console.error('Status check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 