const express = require('express');
const router = express.Router();
const Session = require('../models/session');
const User = require('../models/user');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'veraawell_jwt_secret_key_2024_development_environment_secure_token_generation';

// Middleware to verify JWT token (supports both cookie and Authorization header)
const verifyToken = (req, res, next) => {
  // Check BOTH cookie AND Authorization header
  let token = req.cookies.token;
  
  // If no cookie, check Authorization header
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('[PATIENTS AUTH] Token from Authorization header');
    }
  }
  
  if (!token) {
    console.log('[PATIENTS AUTH] No token found');
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('[PATIENTS AUTH] JWT verification error:', error.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Save emergency contact for patient
router.post('/emergency-contact', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { contactName, contactPhone, contactRelationship } = req.body;

    console.log('[EMERGENCY CONTACT] Save request:', {
      userId,
      role: userRole,
      contactName,
      contactPhone,
      contactRelationship
    });

    // Only patients can set emergency contact
    if (userRole !== 'patient') {
      return res.status(403).json({ message: 'Only patients can set emergency contact' });
    }

    if (!contactName || !contactPhone || !contactRelationship) {
      return res.status(400).json({ message: 'Contact name, phone, and relationship are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.emergencyContact = {
      name: contactName,
      phone: contactPhone,
      relationship: contactRelationship
    };
    await user.save();

    console.log('[EMERGENCY CONTACT] ✅ Saved successfully');

    res.json({
      success: true,
      message: 'Emergency contact saved successfully',
      emergencyContact: user.emergencyContact
    });
  } catch (error) {
    console.error('[EMERGENCY CONTACT] ❌ Error:', error);
    res.status(500).json({ message: 'Failed to save emergency contact' });
  }
});

// Get emergency contact for patient
router.get('/emergency-contact', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    if (userRole !== 'patient') {
      return res.status(403).json({ message: 'Only patients can view emergency contact' });
    }

    const user = await User.findById(userId).select('emergencyContact');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      emergencyContact: user.emergencyContact || null
    });
  } catch (error) {
    console.error('[EMERGENCY CONTACT] Error fetching:', error);
    res.status(500).json({ message: 'Failed to fetch emergency contact' });
  }
});

// Get all patients for a doctor with their session details
router.get('/doctor-patients', verifyToken, async (req, res) => {
  try {
    const doctorId = req.user.userId;
    const userRole = req.user.role;

    // Only doctors can access this endpoint
    if (userRole !== 'doctor') {
      return res.status(403).json({ message: 'Access denied. Only doctors can view patient details.' });
    }

    console.log('📋 Fetching patients for doctor:', doctorId.substring(0, 8));

    // Get all sessions for this doctor
    const sessions = await Session.find({ doctorId })
      .populate('patientId', 'firstName lastName email')
      .lean();

    console.log('📋 Found sessions:', sessions.length);

    // Group sessions by patient and aggregate data
    const patientMap = new Map();

    sessions.forEach(session => {
      if (!session.patientId) return;

      const patientId = session.patientId._id.toString();
      
      if (!patientMap.has(patientId)) {
        patientMap.set(patientId, {
          _id: patientId,
          name: `${session.patientId.firstName} ${session.patientId.lastName}`,
          email: session.patientId.email,
          sessions: []
        });
      }

      patientMap.get(patientId).sessions.push({
        sessionId: session._id,
        sessionType: session.sessionType,
        sessionDate: session.sessionDate,
        status: session.status,
        notes: session.sessionNotes
      });
    });

    // Convert map to array and extract occupation and issue from session notes
    const patients = Array.from(patientMap.values()).map(patient => {
      // Try to extract occupation and issue from session notes
      let occupation = 'Not specified';
      let issue = 'Not specified';

      // Look through sessions for notes that might contain this info
      for (const session of patient.sessions) {
        if (session.notes) {
          // Try to extract occupation
          const occupationMatch = session.notes.match(/occupation[:\s]+([^,\n]+)/i);
          if (occupationMatch) {
            occupation = occupationMatch[1].trim();
          }

          // Try to extract issue/concern
          const issueMatch = session.notes.match(/(?:issue|concern|problem)[:\s]+([^,\n]+)/i);
          if (issueMatch) {
            issue = issueMatch[1].trim();
          }
        }
      }

      return {
        _id: patient._id,
        name: patient.name,
        email: patient.email,
        occupation: occupation,
        issue: issue,
        totalSessions: patient.sessions.length,
        sessions: patient.sessions
      };
    });

    console.log('📋 Returning patients:', patients.length);
    res.json(patients);
  } catch (error) {
    console.error('Error fetching doctor patients:', error);
    res.status(500).json({ message: 'Failed to fetch patient details', error: error.message });
  }
});

module.exports = router;
