const express = require('express');
const router = express.Router();
const User = require('../models/user');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'veraawell_jwt_secret_key_2024_secure';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    console.error('[DOCTOR STATUS] JWT verification error:', error.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Toggle doctor online status
router.post('/toggle-online', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;

    console.log('[DOCTOR STATUS] 🔄 Toggle online status request:', {
      userId,
      role: userRole
    });

    // Only doctors can toggle online status
    if (userRole !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can toggle online status' });
    }

    const doctor = await User.findById(userId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Toggle online status
    doctor.isOnline = !doctor.isOnline;
    doctor.lastActiveAt = new Date();
    await doctor.save();

    console.log('[DOCTOR STATUS] ✅ Online status toggled:', {
      doctorId: userId,
      isOnline: doctor.isOnline,
      lastActiveAt: doctor.lastActiveAt
    });

    res.json({
      success: true,
      isOnline: doctor.isOnline,
      lastActiveAt: doctor.lastActiveAt
    });
  } catch (error) {
    console.error('[DOCTOR STATUS] ❌ Error toggling online status:', error);
    res.status(500).json({ message: 'Failed to toggle online status' });
  }
});

// Get current doctor's online status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;

    if (userRole !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can check status' });
    }

    const doctor = await User.findById(userId).select('isOnline lastActiveAt');
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    res.json({
      isOnline: doctor.isOnline,
      lastActiveAt: doctor.lastActiveAt
    });
  } catch (error) {
    console.error('[DOCTOR STATUS] Error fetching status:', error);
    res.status(500).json({ message: 'Failed to fetch status' });
  }
});

// Get all online doctors (public endpoint)
router.get('/online-doctors', async (req, res) => {
  try {
    console.log('[DOCTOR STATUS] 📋 Fetching online doctors...');

    const onlineDoctors = await User.find({
      role: 'doctor',
      isOnline: true,
      approvalStatus: 'approved'
    })
    .select('firstName lastName email isOnline lastActiveAt profileCompleted')
    .sort({ lastActiveAt: -1 });

    console.log('[DOCTOR STATUS] ✅ Found online doctors:', {
      count: onlineDoctors.length,
      doctors: onlineDoctors.map(d => ({
        id: d._id,
        name: `${d.firstName} ${d.lastName}`,
        lastActive: d.lastActiveAt
      }))
    });

    res.json({
      count: onlineDoctors.length,
      doctors: onlineDoctors
    });
  } catch (error) {
    console.error('[DOCTOR STATUS] ❌ Error fetching online doctors:', error);
    res.status(500).json({ message: 'Failed to fetch online doctors' });
  }
});

// Set doctor offline (called on logout)
router.post('/set-offline', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;

    if (userRole !== 'doctor') {
      return res.json({ success: true }); // Silently succeed for non-doctors
    }

    const doctor = await User.findById(userId);
    if (doctor) {
      doctor.isOnline = false;
      doctor.lastActiveAt = new Date();
      await doctor.save();

      console.log('[DOCTOR STATUS] 🔴 Doctor set offline on logout:', userId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[DOCTOR STATUS] Error setting offline:', error);
    res.status(500).json({ message: 'Failed to set offline' });
  }
});

module.exports = router;
