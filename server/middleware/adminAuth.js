const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');

// Verify admin JWT token
const adminAuth = async (req, res, next) => {
  try {
    // Get token from cookie
    const token = req.cookies.adminToken;
    if (!token) {
      return res.status(401).json({ message: 'Admin authentication required' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET || 'admin-secret');
    
    // Find admin
    const admin = await Admin.findById(decoded.adminId);
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }

    // Check if admin is active
    if (admin.status !== 'active') {
      return res.status(403).json({ message: 'Admin account is suspended' });
    }

    // Add admin to request
    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(401).json({ message: 'Invalid admin token' });
  }
};

// Verify super admin role
const superAdminAuth = async (req, res, next) => {
  try {
    if (!req.admin || req.admin.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super admin privileges required' });
    }
    next();
  } catch (error) {
    console.error('Super admin auth error:', error);
    res.status(403).json({ message: 'Not authorized as super admin' });
  }
};

// Check if first-time setup is needed
const checkFirstTimeSetup = async (req, res, next) => {
  try {
    const hasAdmin = await Admin.hasAnyAdmin();
    if (!hasAdmin) {
      // Allow access for first-time setup
      req.isFirstTimeSetup = true;
      return next();
    }
    // Continue with normal auth
    next();
  } catch (error) {
    console.error('Setup check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Force password change for first login
const requirePasswordChange = async (req, res, next) => {
  try {
    const admin = req.admin;
    if (!admin.isPasswordChanged) {
      return res.status(403).json({ 
        message: 'Password change required',
        requiresPasswordChange: true
      });
    }
    next();
  } catch (error) {
    console.error('Password change check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  adminAuth,
  superAdminAuth,
  checkFirstTimeSetup,
  requirePasswordChange
}; 