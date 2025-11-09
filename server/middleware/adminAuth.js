const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Verify admin JWT token
const adminAuth = async (req, res, next) => {
  try {
    // Get token from cookie OR Authorization header
    let token = req.cookies.adminToken;
    
    // If no cookie, check Authorization header
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('[ADMIN AUTH] Token from Authorization header');
      }
    }
    
    if (!token) {
      console.log('[ADMIN AUTH] No token found in cookie or header');
      return res.status(401).json({ message: 'Admin authentication required' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    console.log('[ADMIN AUTH] Token verified for user:', decoded.userId, 'role:', decoded.role);

    // Check for admin roles
    if (!decoded.role || !['admin', 'super_admin'].includes(decoded.role)) {
      console.log('[ADMIN AUTH] Invalid role:', decoded.role);
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Find admin
    const admin = await User.findById(decoded.userId);
    if (!admin) {
      console.log('[ADMIN AUTH] Admin not found:', decoded.userId);
      return res.status(401).json({ message: 'Admin not found' });
    }

    // Check if admin is active
    if (admin.status !== 'active') {
      console.log('[ADMIN AUTH] Admin account suspended:', admin.email);
      return res.status(403).json({ message: 'Admin account is suspended' });
    }

    console.log('[ADMIN AUTH] ✅ Authentication successful for:', admin.email);
    // Add admin to request
    req.admin = admin;
    next();
  } catch (error) {
    console.error('[ADMIN AUTH] Error:', error.message);
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
    const hasAdmin = await User.hasAnyAdmin();
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