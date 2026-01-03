/**
 * Admin Controller
 * Handles admin-only debug and maintenance endpoints
 */

const User = require('../models/user');
const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/error.middleware');
const { isProduction } = require('../config/environment');
const { createLogger } = require('../utils/logger');
const { AuthorizationError } = require('../utils/errors');

const logger = createLogger('ADMIN-CONTROLLER');

/**
 * Clean up all sessions (admin only, development only)
 */
const cleanupSessions = asyncHandler(async (req, res) => {
  // Only allow in development or with super admin
  if (isProduction() && req.admin?.role !== 'super_admin') {
    throw new AuthorizationError('This endpoint is only available to super admins in production');
  }

  try {
    const sessionCollection = mongoose.connection.db.collection('sessions');
    const result = await sessionCollection.deleteMany({});
    
    logger.info('Sessions cleaned up', { deletedCount: result.deletedCount });
    
    res.json({
      success: true,
      message: 'All sessions cleaned up successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error('Session cleanup error', { error: error.message });
    throw error;
  }
});

/**
 * Fix doctor approval status (admin only)
 */
const fixDoctorApprovals = asyncHandler(async (req, res) => {
  // Only allow super admin
  if (req.admin?.role !== 'super_admin') {
    throw new AuthorizationError('Super admin privileges required');
  }

  try {
    const result = await User.updateMany(
      { 
        role: 'doctor',
        approvalStatus: 'approved',
        approvedBy: null,
        googleId: { $exists: false }
      },
      { 
        $set: { 
          approvalStatus: 'pending',
          approvedAt: null
        }
      }
    );
    
    logger.info('Doctor approvals fixed', { modifiedCount: result.modifiedCount });
    
    res.json({
      success: true,
      message: 'Doctor approval statuses fixed successfully',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Fix doctor approvals error', { error: error.message });
    throw error;
  }
});

/**
 * Debug pending doctors (admin only, development only)
 */
const debugPendingDoctors = asyncHandler(async (req, res) => {
  // Only allow in development or with admin
  if (isProduction() && !req.admin) {
    throw new AuthorizationError('This endpoint requires admin authentication in production');
  }

  try {
    const allDoctors = await User.find({ role: 'doctor' })
      .select('firstName lastName email approvalStatus approvedBy createdAt')
      .sort({ createdAt: -1 });
    
    const pendingDoctors = await User.find({ 
      role: 'doctor',
      approvalStatus: 'pending'
    })
      .select('firstName lastName email approvalStatus approvedBy createdAt')
      .sort({ createdAt: -1 });
    
    logger.debug('Pending doctors checked', {
      total: allDoctors.length,
      pending: pendingDoctors.length
    });
    
    res.json({
      success: true,
      totalDoctors: allDoctors.length,
      pendingCount: pendingDoctors.length,
      allDoctors: allDoctors,
      pendingDoctors: pendingDoctors
    });
  } catch (error) {
    logger.error('Debug pending doctors error', { error: error.message });
    throw error;
  }
});

module.exports = {
  cleanupSessions,
  fixDoctorApprovals,
  debugPendingDoctors
};
