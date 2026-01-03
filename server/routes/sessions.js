const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Session = require('../models/session');
const Conversation = require('../models/conversation');
const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const { verifyToken } = require('../middleware/auth.middleware');
const { updateSessionStatuses } = require('../utils/sessionUpdater');


// Get session statistics for doctor
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    if (userRole !== 'doctor') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update statuses before calculating stats
    await updateSessionStatuses();

    const stats = await Session.aggregate([
      {
        $match: {
          doctorId: new mongoose.Types.ObjectId(userId),
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$price' },
          totalSessions: { $count: {} },
          totalDurationMinutes: { $sum: '$duration' }
        }
      }
    ]);

    const result = stats.length > 0 ? stats[0] : { totalRevenue: 0, totalSessions: 0, totalDurationMinutes: 0 };

    // Convert minutes to hours
    const totalHours = Math.round(result.totalDurationMinutes / 60);

    res.json({
      totalRevenue: result.totalRevenue,
      totalSessions: result.totalSessions,
      totalHours: totalHours
    });

  } catch (error) {
    console.error('Error fetching session stats:', error);
    res.status(500).json({ message: 'Failed to fetch session stats' });
  }
});

// Get call history for the authenticated user
router.get('/call-history', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    console.log('📞 Fetching call history for:', { userId: userId.substring(0, 8), role: userRole });

    // Update statuses before fetching history
    await updateSessionStatuses();

    // Build query based on user role
    const query = userRole === 'patient'
      ? { patientId: userId }
      : { doctorId: userId };

    // Fetch ALL sessions where user participated and call was started
    // This includes: completed, cancelled, or any session where callStartTime exists
    const callHistory = await Session.find({
      ...query,
      $or: [
        { status: { $in: ['completed', 'cancelled'] } },
        { callStatus: { $in: ['in-progress', 'completed'] } },
        { callStartTime: { $exists: true, $ne: null } }
      ]
    })
      .populate('patientId', 'firstName lastName')
      .populate('doctorId', 'firstName lastName')
      .sort({ sessionDate: -1, sessionTime: -1 })
      .lean();

    console.log('📞 Found sessions:', callHistory.length);

    // Format the response
    const formattedHistory = callHistory.map(session => {
      // Handle null doctor/patient (for test sessions where user is both)
      let name = 'Unknown';
      if (userRole === 'patient') {
        if (session.doctorId) {
          name = `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}`;
        } else {
          name = 'Test Session (Self)';
        }
      } else {
        if (session.patientId) {
          name = `${session.patientId.firstName} ${session.patientId.lastName}`;
        } else {
          name = 'Test Session (Self)';
        }
      }

      return {
        _id: session._id,
        name: name,
        date: session.sessionDate,
        duration: session.actualDuration || session.duration,
        mode: session.status === 'cancelled' ? 'Cancelled & Refunded' : (session.callMode || 'Video Calling'),
        paymentAmount: session.price,
        paymentStatus: session.paymentStatus,
        sessionType: session.sessionType,
        status: session.status,
        callStatus: session.callStatus
      };
    });

    console.log('📞 Returning formatted history:', formattedHistory.length, 'records');
    res.json(formattedHistory);
  } catch (error) {
    console.error('Error fetching call history:', error);
    res.status(500).json({ message: 'Failed to fetch call history', error: error.message });
  }
});

// Get available slots for a doctor on a specific date
// Get available slots for a doctor on a specific date
router.get('/doctors/:doctorId/slots/:date', async (req, res) => {
  try {
    const { doctorId, date } = req.params;

    // Find doctor's availability settings
    let availability = await require('../models/doctorAvailability').findOne({ doctorId });

    // If no availability settings found, create default one (same as in availability routes)
    if (!availability) {
      const DoctorAvailability = require('../models/doctorAvailability');
      availability = new DoctorAvailability({
        doctorId,
        availabilityType: 'same_slots',
        defaultSlots: ['09:00 AM', '11:00 AM', '03:00 PM', '05:00 PM'],
        activeDates: [],
        bookedSlots: []
      });
      await availability.save();
    }

    // Get slots using the model method which now handles bookedSlots
    const slots = availability.getAvailableSlotsForDate(date);

    // Filter out booked slots and map to expected format
    const availableSlots = slots
      .filter(slot => !slot.isBooked)
      .map(slot => slot.time); // Client expects array of strings ["09:00 AM", ...]

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
    const patientId = req.user._id.toString();

    // If no doctorId provided or it's a test ID, use the current user as doctor
    // This allows testing by booking a session with yourself
    if (!doctorId || doctorId === 'test-doctor-id') {
      doctorId = patientId; // Use same user as both patient and doctor for testing
      console.log('Using same user as both patient and doctor for testing:', {
        userId: patientId.substring(0, 8)
      });
    }

    // Create immediate session (starts NOW - can join immediately)
    const now = new Date();

    console.log('[IMMEDIATE BOOKING] Server time:', {
      iso: now.toISOString(),
      local: now.toLocaleString(),
      utc: now.toUTCString(),
      timestamp: now.getTime()
    });

    // Use local date to avoid timezone issues
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const sessionDate = `${year}-${month}-${day}`;

    // Current time for immediate joining
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const sessionTime = `${hours}:${minutes}`;

    console.log('[IMMEDIATE BOOKING] Creating session with:', {
      patientId: patientId.substring(0, 8),
      doctorId: doctorId.substring(0, 8),
      sessionType: 'immediate',
      sessionDate,
      sessionTime,
      year,
      month,
      day
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
    console.log('Session saved:', {
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

    // Auto-create conversation between patient and doctor
    try {
      console.log('[CONVERSATION] Creating conversation...');
      console.log('[CONVERSATION] Patient ID:', patientId);
      console.log('[CONVERSATION] Doctor ID:', doctorId);
      console.log('[CONVERSATION] Session ID:', savedSession._id);

      const conversation = await Conversation.findOrCreateConversation(patientId, doctorId, savedSession._id);

      console.log('[CONVERSATION] Conversation created/found:', {
        conversationId: conversation._id,
        participants: conversation.participants.map(p => ({
          userId: p.userId._id || p.userId,
          role: p.role
        }))
      });
    } catch (convError) {
      console.error('[CONVERSATION] Error creating conversation:', convError);
      // Don't fail the session booking if conversation creation fails
    }

    res.status(201).json({
      message: 'Immediate session booked successfully! You can join now.',
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
    const patientId = req.user._id.toString();

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

    // Check against DoctorAvailability model
    const DoctorAvailability = require('../models/doctorAvailability');
    let availability = await DoctorAvailability.findOne({ doctorId });

    // Create default availability if needed
    if (!availability) {
      availability = new DoctorAvailability({
        doctorId,
        availabilityType: 'same_slots',
        defaultSlots: ['09:00 AM', '11:00 AM', '03:00 PM', '05:00 PM'],
        activeDates: [],
        bookedSlots: []
      });
      await availability.save();
    }

    // Check if slot is available in availability settings
    // Note: sessionDate from client is YYYY-MM-DD string
    const isAvailable = availability.isSlotAvailable(sessionDate, sessionTime);
    if (!isAvailable) {
      return res.status(400).json({ message: 'This time slot is not available in doctor\'s calendar' });
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

    // Save availability booking FIRST
    // usage: bookSlot(dateStr, timeStr, sessionId)
    // We pass the session._id even before saving session (typical Mongoose pattern)
    const bookingSuccess = await availability.bookSlot(sessionDate, sessionTime, session._id);

    if (!bookingSuccess) {
      return res.status(400).json({ message: 'Failed to book slot. It may have just been taken.' });
    }

    await session.save();

    // Populate the session with user details
    const populatedSession = await Session.findById(session._id)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');

    // Auto-create conversation between patient and doctor
    try {
      await Conversation.findOrCreateConversation(patientId, doctorId, session._id);
      console.log(`Conversation created/found for patient ${patientId} and doctor ${doctorId}`);
    } catch (convError) {
      console.error('Error creating conversation:', convError);
      // Don't fail the session booking if conversation creation fails
    }

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
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    let query = {};
    if (userRole === 'patient') {
      query.patientId = userId;
    } else if (userRole === 'doctor') {
      query.doctorId = userId;
    }

    // Update statuses before fetching user sessions
    await updateSessionStatuses();

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
    const userId = req.user._id.toString();
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

    // Update statuses before fetching upcoming
    await updateSessionStatuses();

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

// IMPORTANT: Specific routes must come BEFORE parameterized routes like /:sessionId
// Otherwise /:sessionId will match /doctors and cause 401 errors

// Get all doctors with profiles
router.get('/doctors', async (req, res) => {
  try {
    console.log('[DOCTORS] Fetching doctors with profiles...');

    // Get all doctor profiles (only doctors with profiles will appear)
    const doctorProfiles = await DoctorProfile.find({})
      .populate('userId', 'firstName lastName email isOnline profileCompleted');

    console.log('[DOCTORS] Found doctor profiles:', doctorProfiles.length);

    // Filter out profiles where userId doesn't exist or role is not doctor
    const validProfiles = doctorProfiles.filter(profile => {
      if (!profile.userId) {
        console.log('[DOCTORS] Skipping profile with no userId');
        return false;
      }
      return true;
    });

    console.log('[DOCTORS] Valid profiles after filtering:', validProfiles.length);

    // Available doctor images for rotation
    const doctorImages = ['/doctor-01.svg', '/doctor-02.svg', '/doctor-03.svg', '/doctor-04.svg'];

    // Map profiles with images
    const result = validProfiles.map((profile, index) => {
      // If profile exists but has no image, assign one from rotation
      if (!profile.profileImage || profile.profileImage === '/doctor-placeholder.svg') {
        profile.profileImage = doctorImages[index % doctorImages.length];
      }
      return profile;
    });

    console.log('[DOCTORS] Returning', result.length, 'doctors');
    res.json(result);
  } catch (error) {
    console.error('[DOCTORS] Error fetching doctors:', error);
    res.status(500).json({ message: 'Failed to fetch doctors', error: error.message });
  }
});

// Get single doctor by ID with profile
router.get('/doctors/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;

    console.log('Fetching doctor profile for ID:', doctorId);

    // Validate MongoDB ObjectId format
    if (!doctorId.match(/^[0-9a-fA-F]{24}$/)) {
      console.error('Invalid doctor ID format:', doctorId);
      return res.status(400).json({ message: 'Invalid doctor ID format' });
    }

    // First, check if this is a valid doctor user
    const doctor = await User.findOne({ _id: doctorId, role: 'doctor' }).select('firstName lastName email');

    console.log('Doctor found:', doctor ? `${doctor.firstName} ${doctor.lastName}` : 'Not found');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Try to get the doctor's profile
    const profile = await DoctorProfile.findOne({ userId: doctorId });

    console.log('Profile found:', profile ? 'Yes' : 'No (using defaults)');

    // Available doctor images for rotation
    const doctorImages = ['/doctor-01.svg', '/doctor-02.svg', '/doctor-03.svg', '/doctor-04.svg'];

    // Get all doctors to determine index for image rotation
    const allDoctors = await User.find({ role: 'doctor' }).select('_id').sort({ createdAt: 1 });
    const doctorIndex = allDoctors.findIndex(d => d._id.toString() === doctorId);
    const assignedImage = doctorImages[doctorIndex >= 0 ? doctorIndex % doctorImages.length : 0];

    if (profile) {
      // Return existing profile with populated user data
      const populatedProfile = await DoctorProfile.findById(profile._id)
        .populate('userId', 'firstName lastName email');

      // If profile has no image or placeholder, assign one from rotation
      if (!populatedProfile.profileImage || populatedProfile.profileImage === '/doctor-placeholder.svg') {
        populatedProfile.profileImage = assignedImage;
      }

      console.log('Returning populated profile with image:', populatedProfile.profileImage);
      return res.json(populatedProfile);
    } else {
      // Return default profile structure for doctors without profiles
      console.log('Returning default profile with image:', assignedImage);
      return res.json({
        _id: `temp_${doctor._id}`,
        userId: {
          _id: doctor._id,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          email: doctor.email
        },
        specialization: ['Unknown'],
        experience: 0,
        qualification: ['Unknown'],
        languages: ['Unknown'],
        treatsFor: ['General'],
        pricing: {
          min: 0,
          max: 0
        },
        profileImage: assignedImage,
        bio: 'Profile not completed yet',
        isOnline: false,
        rating: {
          average: 0,
          totalReviews: 0
        }
      });
    }
  } catch (error) {
    console.error('Error fetching doctor:', error);
    res.status(500).json({ message: 'Failed to fetch doctor details', error: error.message });
  }
});

// Get session by ID (MUST come after /doctors routes)
router.get('/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id.toString();

    const session = await Session.findById(sessionId)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Check if user is authorized to view this session
    const patientIdStr = session.patientId?._id?.toString() || session.patientId?.toString();
    const doctorIdStr = session.doctorId?._id?.toString() || session.doctorId?.toString();

    if (patientIdStr !== userId && doctorIdStr !== userId) {
      return res.status(403).json({ message: 'Unauthorized to view this session' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ message: 'Failed to fetch session', error: error.message });
  }
});

// Join a session
router.get('/join/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id.toString();

    console.log('[SESSION JOIN] Join request received');
    console.log('[SESSION JOIN] Session ID:', sessionId);
    console.log('[SESSION JOIN] User ID:', userId);

    const session = await Session.findById(sessionId)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');

    if (!session) {
      console.log('[SESSION JOIN] Session not found:', sessionId);
      return res.status(404).json({ message: 'Session not found' });
    }

    console.log('[SESSION JOIN] Session found:', {
      id: sessionId,
      type: session.sessionType,
      status: session.status,
      date: session.sessionDate,
      time: session.sessionTime
    });

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

    // Strict authorization - user must be either the patient or the doctor
    const isAuthorized = isPatient || isDoctor;

    if (!isAuthorized) {
      console.error('Authorization failed:', {
        userId: userId.substring(0, 8),
        patientId: patientIdStr?.substring(0, 8),
        doctorId: doctorIdStr?.substring(0, 8),
        sessionType: session.sessionType
      });
      return res.status(403).json({ message: 'Not authorized to join this session' });
    }

    console.log('User authorized to join session:', {
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
    const userId = req.user._id.toString();

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

    // Release the slot in DoctorAvailability
    try {
      const DoctorAvailability = require('../models/doctorAvailability');
      const availability = await DoctorAvailability.findOne({ doctorId: session.doctorId });

      if (availability) {
        // Convert session date to YYYY-MM-DD string
        const dateStr = session.sessionDate.toISOString().split('T')[0];
        await availability.releaseSlot(dateStr, session.sessionTime);
      }
    } catch (releaseError) {
      console.error('Error releasing slot during cancellation:', releaseError);
      // Don't fail the request if release fails, just log it
    }

    res.json({ message: 'Session cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling session:', error);
    res.status(500).json({ message: 'Failed to cancel session' });
  }
});

// Get sessions for calendar (by month) - Show only user-specific sessions
router.get('/calendar/:year/:month', verifyToken, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.user._id.toString();
    const userRole = req.user.role;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    let query = {
      sessionDate: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Filter sessions based on user role - only show sessions where user is involved
    // Use $or to match either ObjectId or string format
    if (userRole === 'patient') {
      query.patientId = userId;
    } else if (userRole === 'doctor') {
      query.doctorId = userId;
    }

    console.log('📅 Calendar query:', {
      userId: userId.substring(0, 8),
      role: userRole,
      month: `${year}-${month}`,
      dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
    });

    // Update statuses before fetching calendar
    await updateSessionStatuses();

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
        time: s.sessionTime,
        patientId: s.patientId?._id?.toString().substring(0, 8) || 'null',
        doctorId: s.doctorId?._id?.toString().substring(0, 8) || 'null'
      }))
    });

    res.json(sessions);
  } catch (error) {
    console.error('Error in join session:', error);
    res.status(500).json({ message: 'Failed to process session join' });
  }
});

module.exports = router;
