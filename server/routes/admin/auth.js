const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../../models/admin');
const { adminAuth, superAdminAuth, checkFirstTimeSetup, requirePasswordChange } = require('../../middleware/adminAuth');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// First-time setup route
router.post('/setup', checkFirstTimeSetup, async (req, res) => {
  try {
    // Only allow if no admins exist
    const hasAdmin = await Admin.hasAnyAdmin();
    if (hasAdmin) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    // Generate temporary password
    const tempPassword = crypto.randomBytes(8).toString('hex');

    // Create super admin
    const admin = await Admin.createFirstAdmin({
      email: req.body.email,
      password: tempPassword,
      firstName: req.body.firstName,
      lastName: req.body.lastName
    });

    // Send credentials via email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: admin.email,
      subject: 'Veraawell Admin Account Created',
      html: `
        <h2>Your Admin Account Has Been Created</h2>
        <p>Email: ${admin.email}</p>
        <p>Temporary Password: ${tempPassword}</p>
        <p>Please change your password upon first login.</p>
      `
    });

    res.status(201).json({ 
      message: 'Super admin created successfully. Check email for credentials.' 
    });
  } catch (error) {
    console.error('Admin setup error:', error);
    res.status(500).json({ message: 'Failed to create admin account' });
  }
});

// Admin login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin
    const admin = await Admin.findOne({ email: email.toLowerCase() });
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

    // Create token
    const token = jwt.sign(
      { adminId: admin._id, role: admin.role },
      process.env.ADMIN_JWT_SECRET || 'admin-secret',
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
router.post('/change-password', adminAuth, async (req, res) => {
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
router.post('/create', adminAuth, superAdminAuth, async (req, res) => {
  try {
    const { email, firstName, lastName, role } = req.body;

    // Generate temporary password
    const tempPassword = crypto.randomBytes(8).toString('hex');

    // Create admin
    const newAdmin = new Admin({
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
router.post('/logout', adminAuth, async (req, res) => {
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

module.exports = router; 