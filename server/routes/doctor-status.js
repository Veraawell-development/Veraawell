const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { verifyToken } = require('../middleware/auth.middleware');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DOCTOR-STATUS');

// Toggle doctor online status
router.post('/toggle-online', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    // Only doctors can toggle online status
    if (userRole !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can toggle online status' });
    }

    // req.user is already the User model instance
    // Toggle online status
    req.user.isOnline = !req.user.isOnline;
    req.user.lastActiveAt = new Date();
    await req.user.save();

    // ✨ REAL-TIME UPDATE: Broadcast status change to all patients
    const io = req.app.get('io');
    if (io) {
      const SocketEmitter = require('../utils/socketEmitter');
      const emitter = new SocketEmitter(io);

      emitter.emitToRole('patient', 'doctor:status-change', {
        doctorId: userId,
        isOnline: req.user.isOnline,
        lastActiveAt: req.user.lastActiveAt,
        timestamp: new Date()
      });

      logger.info('Doctor status change broadcasted', {
        doctorId: userId.substring(0, 8),
        isOnline: req.user.isOnline
      });
    }

    res.json({
      success: true,
      isOnline: req.user.isOnline,
      lastActiveAt: req.user.lastActiveAt
    });
  } catch (error) {
    logger.error('Error toggling online status', { error: error.message, userId: req.user._id.toString() });
    res.status(500).json({ message: 'Failed to toggle online status' });
  }
});

// Get current doctor's online status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const userRole = req.user.role;

    if (userRole !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can check status' });
    }

    // req.user is already the User model instance
    res.json({
      isOnline: req.user.isOnline,
      lastActiveAt: req.user.lastActiveAt
    });
  } catch (error) {
    logger.error('Error fetching status', { error: error.message, userId: req.user._id.toString() });
    res.status(500).json({ message: 'Failed to fetch status' });
  }
});

// Get all online doctors (public endpoint)
router.get('/online-doctors', async (req, res) => {
  try {
    const onlineDoctors = await User.find({
      role: 'doctor',
      isOnline: true,
      approvalStatus: 'approved'
    })
      .select('firstName lastName email isOnline lastActiveAt profileCompleted')
      .sort({ lastActiveAt: -1 });

    res.json({
      count: onlineDoctors.length,
      doctors: onlineDoctors
    });
  } catch (error) {
    logger.error('Error fetching online doctors', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch online doctors' });
  }
});

// Set doctor offline (called on logout)
router.post('/set-offline', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    if (userRole !== 'doctor') {
      return res.json({ success: true }); // Silently succeed for non-doctors
    }

    // req.user is already the User model instance
    req.user.isOnline = false;
    req.user.lastActiveAt = new Date();
    await req.user.save();

    // ✨ REAL-TIME UPDATE: Broadcast offline status to all patients
    const io = req.app.get('io');
    if (io) {
      const SocketEmitter = require('../utils/socketEmitter');
      const emitter = new SocketEmitter(io);

      emitter.emitToRole('patient', 'doctor:status-change', {
        doctorId: userId,
        isOnline: false,
        lastActiveAt: req.user.lastActiveAt,
        timestamp: new Date()
      });

      logger.info('Doctor offline status broadcasted', {
        doctorId: userId.substring(0, 8)
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error setting offline', { error: error.message, userId: req.user._id.toString() });
    res.status(500).json({ message: 'Failed to set offline' });
  }
});

module.exports = router;
