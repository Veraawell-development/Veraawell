const express = require('express');
const router = express.Router();
const Session = require('../models/session');
const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Use the same JWT_SECRET logic as the main server
const JWT_SECRET = process.env.JWT_SECRET || 'veraawell_jwt_secret_key_2024_development_environment_secure_token_generation';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT verification error:', error.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};


// Get available slots for a doctor on a specific date
router.get('/doctors/:doctorId/slots/:date', async (req, res) => {
  try {
    const { doctorId, date } = req.params;
    const availableSlots = await Session.getAvailableSlots(doctorId, new Date(date));
    res.json({ availableSlots });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({ message: 'Failed to fetch available slots' });
  }
});

// Book an immediate session (for testing video calls)
router.post('/book-immediate', verifyToken, async (req, res) => {
  try {
    let { doctorId } = req.body;
    const patientId = req.user.userId;

    // If no doctorId provided or it's a test ID, use the current user as doctor
    // This allows testing by booking a session with yourself
    if (!doctorId || doctorId === 'test-doctor-id') {
      doctorId = patientId; // Use same user as both patient and doctor for testing
      console.log('🔄 Using same user as both patient and doctor for testing:', {
        userId: patientId.substring(0, 8)
      });
    }

    // Create immediate session (starts in 2 minutes)
    const now = new Date();
    const sessionDateTime = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes from now
    const sessionDate = sessionDateTime.toISOString().split('T')[0];
    const sessionTime = sessionDateTime.toTimeString().slice(0, 5);

    console.log('💾 Creating session with data:', {
      patientId: patientId.substring(0, 8),
      doctorId: doctorId.substring(0, 8),
      sessionType: 'immediate'
    });

    const session = new Session({
      patientId: patientId,
      doctorId: doctorId,
      sessionDate: new Date(sessionDate),
      sessionTime,
      sessionType: 'immediate',
      duration: 60,
      price: 0,
      paymentStatus: 'paid',
      paymentId: `immediate_${Date.now()}`,
      meetingLink: null
    });

    const savedSession = await session.save();
    console.log('✅ Session saved:', {
      id: savedSession._id.toString().substring(0, 8),
      patientId: savedSession.patientId?.toString().substring(0, 8) || 'null',
      doctorId: savedSession.doctorId?.toString().substring(0, 8) || 'null'
    });

    // Set meeting link using the actual session ID
    savedSession.meetingLink = `/video-call/${savedSession._id}`;
    await savedSession.save();

    // Populate the session with user details
    const populatedSession = await Session.findById(session._id)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');

    res.status(201).json({
      message: 'Immediate session booked successfully! You can join in 2 minutes.',
      session: populatedSession
    });
  } catch (error) {
    console.error('Error booking immediate session:', error);
    res.status(500).json({ message: 'Failed to book immediate session' });
  }
});

// Book a session
router.post('/book', verifyToken, async (req, res) => {
  try {
    const { doctorId, sessionDate, sessionTime, sessionType, price, mode, duration, serviceType } = req.body;
    const patientId = req.user.userId;

    // Validate required fields
    if (!doctorId || !sessionDate || !sessionTime || price === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if the slot is still available
    const existingSession = await Session.findOne({
      doctorId,
      sessionDate: new Date(sessionDate),
      sessionTime,
      status: { $ne: 'cancelled' }
    });

    if (existingSession) {
      return res.status(400).json({ message: 'This time slot is no longer available' });
    }

    // Generate unique meeting link for video call
    const sessionId = crypto.randomBytes(16).toString('hex');
    const meetingLink = `/video-call/${sessionId}`;

    // Create new session
    const session = new Session({
      patientId,
      doctorId,
      sessionDate: new Date(sessionDate),
      sessionTime,
      sessionType: sessionType || 'regular',
      duration: duration || 60,
      price,
      paymentStatus: 'paid', // Mock payment - always paid
      paymentId: `mock_payment_${Date.now()}`,
      meetingLink,
      sessionNotes: `Service Type: ${serviceType || 'General'}, Mode: ${mode || 'video'}`
    });

    await session.save();

    // Populate the session with user details
    const populatedSession = await Session.findById(session._id)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');

    res.status(201).json({
      message: 'Session booked successfully',
      session: populatedSession
    });
  } catch (error) {
    console.error('Error booking session:', error);
    res.status(500).json({ message: 'Failed to book session' });
  }
});

// Get user's sessions (patient or doctor)
router.get('/my-sessions', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    let query = {};
    if (userRole === 'patient') {
      query.patientId = userId;
    } else if (userRole === 'doctor') {
      query.doctorId = userId;
    }

    const sessions = await Session.find(query)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email')
      .sort({ sessionDate: 1, sessionTime: 1 });

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    res.status(500).json({ message: 'Failed to fetch sessions' });
  }
});

// Get upcoming sessions
router.get('/upcoming', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    let query = {
      status: 'scheduled',
      sessionDate: { $gte: new Date() }
    };
    
    if (userRole === 'patient') {
      query.patientId = userId;
    } else if (userRole === 'doctor') {
      query.doctorId = userId;
    }

    const sessions = await Session.find(query)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email')
      .sort({ sessionDate: 1, sessionTime: 1 })
      .limit(10);

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching upcoming sessions:', error);
    res.status(500).json({ message: 'Failed to fetch upcoming sessions' });
  }
});

// Join a session
router.get('/join/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    const session = await Session.findById(sessionId)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if user is authorized to join this session
    const patientIdStr = session.patientId?._id?.toString() || session.patientId?.toString();
    const doctorIdStr = session.doctorId?._id?.toString() || session.doctorId?.toString();
    
    console.log('Join session debug:', {
      userId,
      patientIdStr,
      doctorIdStr,
      sessionId: sessionId.substring(0, 8),
      sessionType: session.sessionType
    });
    
    const isPatient = patientIdStr === userId;
    const isDoctor = doctorIdStr === userId;
    
    // For immediate sessions (testing), allow if user is either patient or doctor
    // For regular sessions, strict authorization
    const isAuthorized = isPatient || isDoctor || session.sessionType === 'immediate';

    if (!isAuthorized) {
      console.error('Authorization failed:', { 
        userId: userId.substring(0, 8), 
        patientId: patientIdStr?.substring(0, 8), 
        doctorId: doctorIdStr?.substring(0, 8),
        sessionType: session.sessionType
      });
      return res.status(403).json({ message: 'Not authorized to join this session' });
    }
    
    console.log('✅ User authorized to join session:', {
      userId: userId.substring(0, 8),
      role: isPatient ? 'patient' : 'doctor',
      sessionType: session.sessionType
    });

    // For immediate sessions or sessions within join window, allow joining
    const canJoin = session.sessionType === 'immediate' || session.canJoin();
    
    if (!canJoin) {
      return res.status(400).json({ message: 'Session cannot be joined at this time. Please wait until 15 minutes before the scheduled time.' });
    }

    res.json({
      message: 'Session can be joined',
      session,
      meetingLink: session.meetingLink
    });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({ message: 'Failed to join session', error: error.message });
  }
});

// Cancel a session
router.put('/cancel/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if user is authorized to cancel this session
    const isPatient = session.patientId.toString() === userId;
    const isDoctor = session.doctorId.toString() === userId;

    if (!isPatient && !isDoctor) {
      return res.status(403).json({ message: 'Not authorized to cancel this session' });
    }

    // Check if session can be cancelled (at least 24 hours before)
    const sessionDateTime = new Date(session.sessionDate);
    const [hours, minutes] = session.sessionTime.split(':').map(Number);
    sessionDateTime.setHours(hours, minutes, 0, 0);
    
    const now = new Date();
    const timeDiff = sessionDateTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    if (hoursDiff < 24) {
      return res.status(400).json({ message: 'Sessions can only be cancelled 24 hours in advance' });
    }

    session.status = 'cancelled';
    session.paymentStatus = 'refunded';
    await session.save();

    res.json({ message: 'Session cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling session:', error);
    res.status(500).json({ message: 'Failed to cancel session' });
  }
});

// Get sessions for calendar (by month) - Show all sessions to all users
router.get('/calendar/:year/:month', verifyToken, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    let query = {
      sessionDate: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // For immediate sessions (testing), show to all users
    // For regular sessions, filter by user role
    if (userRole === 'patient') {
      query.$or = [
        { patientId: userId },
        { sessionType: 'immediate' } // Show immediate sessions to all
      ];
    } else if (userRole === 'doctor') {
      query.$or = [
        { doctorId: userId },
        { sessionType: 'immediate' }, // Show immediate sessions to all
        { patientId: userId, sessionType: 'immediate' } // Show self-sessions where user is both patient and doctor
      ];
    }

    console.log('📅 Calendar query:', {
      userId: userId.substring(0, 8),
      role: userRole,
      month: `${year}-${month}`,
      query: JSON.stringify(query)
    });

    const sessions = await Session.find(query)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email')
      .sort({ sessionDate: 1, sessionTime: 1 });

    console.log('📅 Found sessions:', {
      count: sessions.length,
      sessions: sessions.map(s => ({
        id: s._id.toString().substring(0, 8),
        type: s.sessionType,
        date: s.sessionDate.toISOString().split('T')[0],
        time: s.sessionTime
      }))
    });

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching calendar sessions:', error);
    res.status(500).json({ message: 'Failed to fetch calendar sessions' });
  }
});

// Get all doctors with their profiles
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await DoctorProfile.find({})
      .populate('userId', 'firstName lastName email')
      .sort({ 'rating.average': -1 });
    
    res.json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ message: 'Failed to fetch doctors' });
  }
});

module.exports = router;
