/**
 * Session Controller
 * All session lifecycle operations — booking, listing, joining, cancellation, doctor discovery
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Session = require('../models/session');
const Conversation = require('../models/conversation');
const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const DoctorAvailability = require('../models/doctorAvailability');
const Review = require('../models/review');
const PlatformSettings = require('../models/platformSettings');
const Razorpay = require('razorpay');
const SocketEmitter = require('../utils/socketEmitter');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
const { calculateSessionPrice, getOrCreateAvailability, getGenderBasedImage } = require('../services/session.service');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-CTRL');
const emailService = require('../services/email.service');

const SESSION_TYPE_MAP = { scheduled: 'regular', regular: 'regular', discovery: 'discovery', 'follow-up': 'follow-up', immediate: 'immediate' };
const CALL_MODE_MAP = { video: 'Video Calling', voice: 'Voice Calling' };

function _emitToUsers(req, event, data, userIds) {
  const io = req.app.get('io');
  if (io) new SocketEmitter(io).emitToUsers(userIds, event, data);
}

/** GET /api/sessions/stats — Doctor session statistics + earnings breakdown */
const getStats = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Access denied');
  const userId = req.user._id.toString();

  const [overallStats, recentEarnings] = await Promise.all([
    Session.aggregate([
      { $match: { doctorId: new mongoose.Types.ObjectId(userId), status: 'completed', paymentStatus: 'paid' } },
      {
        $group: {
          _id: null,
          totalGross: { $sum: '$price' },
          totalPlatformFee: { $sum: '$platformFee' },
          totalDoctorEarnings: { $sum: '$doctorEarnings' },
          totalSessions: { $count: {} },
          totalDurationMinutes: { $sum: '$duration' }
        }
      }
    ]),
    // Last 30 days daily breakdown for chart
    Session.aggregate([
      {
        $match: {
          doctorId: new mongoose.Types.ObjectId(userId),
          status: 'completed',
          paymentStatus: 'paid',
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$sessionDate' } },
          earnings: { $sum: '$doctorEarnings' },
          sessions: { $count: {} }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  const r = overallStats[0] || { totalGross: 0, totalPlatformFee: 0, totalDoctorEarnings: 0, totalSessions: 0, totalDurationMinutes: 0 };

  // Pending payout = completed + paid sessions with no transfer yet
  const pendingPayout = await Session.aggregate([
    {
      $match: {
        doctorId: new mongoose.Types.ObjectId(userId),
        status: 'completed',
        paymentStatus: 'paid',
        razorpayTransferId: null
      }
    },
    { $group: { _id: null, amount: { $sum: '$doctorEarnings' } } }
  ]);

  res.json({
    success: true,
    totalGross: r.totalGross,
    totalPlatformFee: r.totalPlatformFee,
    totalDoctorEarnings: r.totalDoctorEarnings,
    totalSessions: r.totalSessions,
    totalHours: Math.round(r.totalDurationMinutes / 60),
    pendingPayout: pendingPayout[0]?.amount || 0,
    recentEarnings
  });
});


/** GET /api/sessions/my-doctors — Top 3 previously booked doctors for a patient */
const getMyDoctors = asyncHandler(async (req, res) => {
  if (req.user.role !== 'patient') throw new AuthorizationError('Only patients can access this endpoint');
  const userId = req.user._id;
  const previousDoctors = await Session.aggregate([
    { $match: { patientId: new mongoose.Types.ObjectId(userId), status: { $in: ['completed', 'ended'] } } },
    { $group: { _id: '$doctorId', sessionCount: { $sum: 1 }, lastSession: { $max: '$sessionDate' } } },
    { $sort: { sessionCount: -1, lastSession: -1 } },
    { $limit: 3 }
  ]);
  if (!previousDoctors.length) return res.json([]);
  const doctors = await DoctorProfile.find({ userId: { $in: previousDoctors.map(d => d._id) } }).populate('userId', 'firstName lastName email').lean();
  const result = doctors.map(d => {
    const stats = previousDoctors.find(p => p._id.equals(d.userId._id));
    return { ...d, sessionCount: stats?.sessionCount || 0, lastSessionDate: stats?.lastSession || null };
  });
  res.json(result);
});

/** GET /api/sessions/pending-feedback — Sessions needing patient review */
const getPendingFeedback = asyncHandler(async (req, res) => {
  if (req.user.role !== 'patient') return res.json({ session: null });
  const userId = req.user._id.toString();
  const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const completedSessions = await Session.find({ patientId: new mongoose.Types.ObjectId(userId), status: 'completed', sessionDate: { $gte: threeDaysAgo } })
    .populate('doctorId', 'firstName lastName').sort({ sessionDate: -1, sessionTime: -1 }).lean();
  for (const session of completedSessions) {
    const review = await Review.findOne({ sessionId: new mongoose.Types.ObjectId(session._id), patientId: new mongoose.Types.ObjectId(userId), reviewType: 'doctor' });
    if (!review) return res.json({ session: { _id: session._id, sessionDate: session.sessionDate, sessionTime: session.sessionTime, status: session.status, doctorId: session.doctorId, sessionType: session.sessionType } });
  }
  res.json({ session: null });
});

/** GET /api/sessions/call-history — Call history for the authenticated user */
const getCallHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const userRole = req.user.role;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const query = userRole === 'patient' ? { patientId: userId } : { doctorId: userId };
  const callHistory = await Session.find({ ...query, $or: [{ status: { $in: ['completed', 'cancelled'] } }, { callStatus: { $in: ['in-progress', 'completed'] } }, { callStartTime: { $exists: true, $ne: null } }] })
    .populate('patientId', 'firstName lastName').populate('doctorId', 'firstName lastName').select('+rating').sort({ sessionDate: -1, sessionTime: -1 }).skip(skip).limit(limit).lean();
  const formatted = callHistory.map(s => ({
    _id: s._id,
    name: userRole === 'patient' ? (s.doctorId ? `Dr. ${s.doctorId.firstName} ${s.doctorId.lastName}` : 'Test Session (Self)') : (s.patientId ? `${s.patientId.firstName} ${s.patientId.lastName}` : 'Test Session (Self)'),
    date: s.sessionDate, duration: s.actualDuration || s.duration, mode: s.status === 'cancelled' ? 'Cancelled & Refunded' : (s.callMode || 'Video Calling'),
    paymentAmount: s.price, paymentStatus: s.paymentStatus, sessionType: s.sessionType, status: s.status, callStatus: s.callStatus, rating: s.rating
  }));
  res.json(formatted);
});

/** 
 * Cleans up abandoned checkout sessions older than 15 minutes 
 * to free up calendar slots.
 */
const cleanupPendingSessions = async () => {
  try {
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const pendingSessions = await Session.find({
      paymentStatus: 'pending',
      createdAt: { $lt: fifteenMinsAgo }
    });

    if (pendingSessions.length === 0) return;

    const sessionIds = pendingSessions.map(s => s._id);
    const doctorIds = [...new Set(pendingSessions.map(s => s.doctorId.toString()))];

    await Session.updateMany(
      { _id: { $in: sessionIds } },
      { $set: { status: 'cancelled', paymentStatus: 'failed' } }
    );

    const DoctorAvailability = require('../models/doctorAvailability');
    for (const docId of doctorIds) {
      const availability = await DoctorAvailability.findOne({ doctorId: docId });
      if (availability) {
        availability.bookedSlots = availability.bookedSlots.filter(
          slot => !sessionIds.some(id => id.equals(slot.sessionId))
        );
        await availability.save();
      }
    }
    logger.info(`Cleaned up ${sessionIds.length} abandoned sessions.`);
  } catch (error) {
    logger.error('Error cleaning up pending sessions:', error);
  }
};

/** GET /api/sessions/doctors/:doctorId/slots/:date */
const getDoctorSlots = asyncHandler(async (req, res) => {
  await cleanupPendingSessions(); // Clean up abandoned checkouts before returning availability
  
  const { doctorId, date } = req.params;
  const availability = await getOrCreateAvailability(doctorId);
  const slots = availability.getAvailableSlotsForDate(date).filter(s => !s.isBooked).map(s => s.time);
  res.json({ availableSlots: slots });
});

/** POST /api/sessions/book-immediate — Book an immediate (now) session */
const bookImmediate = asyncHandler(async (req, res) => {
  let { doctorId, mode, duration, price } = req.body;
  const patientId = req.user._id.toString();
  if (!doctorId || doctorId === 'test-doctor-id') doctorId = patientId;

  const now = new Date();
  const sessionTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const finalPrice = await calculateSessionPrice(doctorId, mode, duration, price);

  let razorpayOrderId = null;
  let platformFee = 0;
  let doctorEarnings = 0;
  
  if (doctorId !== patientId) {
    const doctorProfile = await DoctorProfile.findOne({ userId: doctorId });
    if (doctorProfile) {
      const platformSettings = await PlatformSettings.getSettings();
      const feePercentage = doctorProfile.customFeePercentage !== null ? doctorProfile.customFeePercentage : platformSettings.defaultPlatformFeePercentage;
      platformFee = Math.round((finalPrice * feePercentage) / 100);
      doctorEarnings = finalPrice - platformFee;
      
      if (doctorProfile.razorpayAccountId) {
        try {
          const orderPayload = {
            amount: finalPrice * 100,
            currency: 'INR',
            receipt: `rcpt_imm_${Date.now()}`
          };

          if (!doctorProfile.razorpayAccountId.startsWith('acc_mock')) {
            orderPayload.transfers = [{
              account: doctorProfile.razorpayAccountId,
              amount: doctorEarnings * 100,
              currency: 'INR',
              notes: { branch: "Veerawell Immediate" }
            }];
          }

          const order = await razorpay.orders.create(orderPayload);
          razorpayOrderId = order.id;
        } catch (err) {
          logger.warn('Razorpay immediate order creation failed', { error: err });
        }
      }
    }
  }

  const session = new Session({ 
    patientId, 
    doctorId, 
    sessionDate: now, 
    sessionTime, 
    sessionType: 'immediate', 
    duration: duration || 20, 
    price: finalPrice,
    platformFee,
    doctorEarnings, 
    paymentStatus: razorpayOrderId ? 'pending' : 'paid',
    status: razorpayOrderId ? 'payment_pending' : 'scheduled',
    paymentId: razorpayOrderId ? null : `immediate_${Date.now()}`,
    razorpayOrderId, 
    callMode: CALL_MODE_MAP[mode] || 'Video Calling' 
  });
  const saved = await session.save();
  saved.meetingLink = `/video-call/${saved._id}`;
  await saved.save();

  const populated = await Session.findById(session._id).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email');

  try { await Conversation.findOrCreateConversation(patientId, doctorId, saved._id); } catch (e) { logger.warn('Conversation creation failed', { error: e.message }); }

  // If mock payment (no razorpayOrderId), emit immediately
  if (!razorpayOrderId) {
    _emitToUsers(req, 'session:booked', { session: populated, patientId, doctorId, sessionId: saved._id.toString(), timestamp: new Date() }, [patientId, doctorId]);
  }
  
  try {
    if (!razorpayOrderId) {
      const emailService = require('../services/email.service');
      if (populated.patientId.email) {
        await emailService.sendBookingConfirmationEmail(populated.patientId.email, {
          date: new Date(saved.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          time: saved.sessionTime,
          type: saved.sessionType || 'Immediate'
        });
      }
    }
  } catch (emailErr) { logger.warn('Email send failed', { error: emailErr.message }); }

  logger.info('Immediate session order created', { sessionId: saved._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, message: 'Immediate session order created.', session: populated });
});

/** POST /api/sessions/book — Book a scheduled session */
const bookSession = asyncHandler(async (req, res) => {
  const { doctorId, sessionDate, sessionTime, sessionType, price, mode, duration, serviceType } = req.body;
  const patientId = req.user._id.toString();

  if (!doctorId || !sessionDate || !sessionTime || price === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  // Validate slot is in the future
  const [timeVal, period] = sessionTime.split(' ');
  let [h, m] = timeVal.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const requestedDT = new Date(sessionDate);
  requestedDT.setHours(h, m, 0, 0);
  if (requestedDT < new Date()) return res.status(400).json({ success: false, message: 'Cannot book a time slot in the past' });

  const existing = await Session.findOne({ doctorId, sessionDate: new Date(sessionDate), sessionTime, status: { $ne: 'cancelled' } });
  if (existing) return res.status(400).json({ success: false, message: 'This time slot is no longer available' });

  const doctorProfile = await DoctorProfile.findOne({ userId: doctorId });
  if (!doctorProfile) return res.status(400).json({ success: false, message: 'Doctor profile not found' });

  const finalPrice = await calculateSessionPrice(doctorId, mode, duration, price);
  const availability = await getOrCreateAvailability(doctorId);

  if (!availability.isSlotAvailable(sessionDate, sessionTime)) {
    return res.status(400).json({ success: false, message: "This time slot is not available in doctor's calendar" });
  }

  const platformSettings = await PlatformSettings.getSettings();
  const feePercentage = doctorProfile.customFeePercentage !== null ? doctorProfile.customFeePercentage : platformSettings.defaultPlatformFeePercentage;
  const platformFee = Math.round((finalPrice * feePercentage) / 100);
  const doctorEarnings = finalPrice - platformFee;

  let razorpayOrderId = null;
  if (doctorProfile.razorpayAccountId) {
    try {
      const orderPayload = {
        amount: finalPrice * 100,
        currency: 'INR',
        receipt: `rcpt_${Date.now()}`
      };

      // Only add transfers if it's a real Razorpay account, otherwise it will fail in test mode
      if (!doctorProfile.razorpayAccountId.startsWith('acc_mock')) {
        orderPayload.transfers = [{
          account: doctorProfile.razorpayAccountId,
          amount: doctorEarnings * 100,
          currency: 'INR',
          notes: {
            branch: "Veerawell Session"
          }
        }];
      }

      const order = await razorpay.orders.create(orderPayload);
      razorpayOrderId = order.id;
    } catch (err) {
      logger.warn('Razorpay order creation failed', { error: err });
    }
  }

  const meetingLink = `/video-call/${crypto.randomBytes(16).toString('hex')}`;
  const session = new Session({
    patientId, doctorId, sessionDate: new Date(sessionDate), sessionTime,
    sessionType: SESSION_TYPE_MAP[sessionType] || 'regular', duration: duration || 60,
    price: finalPrice, platformFee, doctorEarnings,
    paymentStatus: razorpayOrderId ? 'pending' : 'paid',
    status: razorpayOrderId ? 'payment_pending' : 'scheduled',
    paymentId: razorpayOrderId ? null : `mock_payment_${Date.now()}`,
    razorpayOrderId,
    meetingLink, sessionNotes: `Service Type: ${serviceType || 'General'}`,
    callMode: CALL_MODE_MAP[mode] || 'Video Calling'
  });

  const booked = await availability.bookSlot(sessionDate, sessionTime, session._id);
  if (!booked) return res.status(400).json({ success: false, message: 'Failed to book slot. It may have just been taken.' });

  await session.save();
  const populated = await Session.findById(session._id).populate('patientId', 'firstName lastName email phoneNumber').populate('doctorId', 'firstName lastName email');



  try { await Conversation.findOrCreateConversation(patientId, doctorId, session._id); } catch (e) { logger.warn('Conversation creation failed', { error: e.message }); }

  if (!razorpayOrderId) {
    _emitToUsers(req, 'session:booked', { session: populated, patientId, doctorId, sessionId: session._id.toString(), timestamp: new Date() }, [patientId, doctorId]);
  }

  try {
    if (!razorpayOrderId) {
      const emailService = require('../services/email.service');
      if (populated.patientId.email) {
        await emailService.sendBookingConfirmationEmail(populated.patientId.email, {
          date: new Date(populated.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          time: populated.sessionTime,
          type: populated.sessionType || 'Regular'
        });
      }
    }
  } catch (emailErr) { logger.warn('Email send failed', { error: emailErr.message }); }
  logger.info('Session order created', { sessionId: session._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, message: 'Session order created', session: populated });
});

const attachDoctorProfiles = async (sessions) => {
  const doctorIds = [...new Set(sessions.map(s => s.doctorId?._id?.toString()).filter(Boolean))];
  const doctorProfiles = await DoctorProfile.find({ userId: { $in: doctorIds } }).select('userId profileImage');
  const profileMap = {};
  doctorProfiles.forEach(p => {
    profileMap[p.userId.toString()] = p.profileImage;
  });

  return sessions.map(session => {
    const s = session.toObject ? session.toObject() : session;
    if (s.doctorId && profileMap[s.doctorId._id.toString()]) {
      s.doctorId.profileImage = profileMap[s.doctorId._id.toString()];
    }
    if (s.doctorId && (!s.doctorId.profileImage || s.doctorId.profileImage.includes('doctor-0') || s.doctorId.profileImage === '/doctor-placeholder.svg')) {
      s.doctorId.profileImage = getGenderBasedImage(s.doctorId);
    }
    return s;
  });
};

/** GET /api/sessions/my-sessions */
const getMySessions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const userId = req.user._id.toString();
  const query = req.user.role === 'patient' ? { patientId: userId } : { doctorId: userId };
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ sessionDate: -1, sessionTime: -1 }).skip(skip).limit(limit);
  const enrichedSessions = await attachDoctorProfiles(sessions);
  res.json(enrichedSessions);
});

/** GET /api/sessions/upcoming */
const getUpcoming = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const query = { status: 'scheduled', sessionDate: { $gte: new Date() }, ...(req.user.role === 'patient' ? { patientId: userId } : { doctorId: userId }) };
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ sessionDate: 1, sessionTime: 1 }).limit(10);
  const enrichedSessions = await attachDoctorProfiles(sessions);
  res.json(enrichedSessions);
});

/** GET /api/sessions/doctors — All doctors with profiles (public) */
const getAllDoctors = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const profiles = await DoctorProfile.find({}).populate('userId', 'firstName lastName email isOnline profileCompleted').skip(skip).limit(limit);
  const valid = profiles.filter(p => !!p.userId);
  const doctorIds = valid.map(p => p.userId?._id).filter(Boolean);
  const ratingAgg = await Review.aggregate([
    { $match: { doctorId: { $in: doctorIds.map(id => new mongoose.Types.ObjectId(id)) }, reviewType: 'doctor' } },
    { $group: { _id: '$doctorId', average: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
  ]);
  const ratingMap = {};
  ratingAgg.forEach(r => { ratingMap[r._id.toString()] = { average: Math.round(r.average * 10) / 10, totalReviews: r.totalReviews }; });
  const result = valid.map(profile => {
    if (!profile.profileImage || profile.profileImage.trim() === '' || profile.profileImage.includes('doctor-0') || profile.profileImage === '/doctor-placeholder.svg') {
      profile.profileImage = getGenderBasedImage(profile.userId);
    }
    const obj = profile.toObject();
    const uid = obj.userId?._id?.toString();
    obj.rating = (uid && ratingMap[uid]) ? ratingMap[uid] : { average: 0, totalReviews: 0 };
    return obj;
  });
  logger.info('Doctors list fetched', { count: result.length });
  res.json(result);
});

/** GET /api/sessions/doctors/:doctorId — Single doctor with live rating */
const getDoctorById = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  if (!doctorId.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ success: false, message: 'Invalid doctor ID format' });
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' }).select('firstName lastName email');
  if (!doctor) throw new NotFoundError('Doctor');
  const genderImage = getGenderBasedImage(doctor);
  const profile = await DoctorProfile.findOne({ userId: doctorId }).populate('userId', 'firstName lastName email');
  const ratingStats = await Review.aggregate([
    { $match: { doctorId: new mongoose.Types.ObjectId(doctorId), reviewType: 'doctor' } },
    { $group: { _id: null, average: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
  ]);
  const liveRating = ratingStats.length > 0 ? { average: Math.round(ratingStats[0].average * 10) / 10, totalReviews: ratingStats[0].totalReviews } : { average: 0, totalReviews: 0 };
  if (profile) {
    if (!profile.profileImage || profile.profileImage.includes('doctor-0') || profile.profileImage === '/doctor-placeholder.svg') profile.profileImage = genderImage;
    const obj = profile.toObject();
    obj.rating = liveRating;
    return res.json(obj);
  }
  res.json({ _id: `temp_${doctor._id}`, userId: { _id: doctor._id, firstName: doctor.firstName, lastName: doctor.lastName, email: doctor.email }, specialization: ['Unknown'], experience: 0, qualification: ['Unknown'], languages: ['Unknown'], treatsFor: ['General'], pricing: { min: 0, max: 0 }, profileImage: genderImage, bio: 'Profile not completed yet', isOnline: false, rating: liveRating });
});

/** GET /api/sessions/:sessionId — Get session by ID */
const getSessionById = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.sessionId).populate('patientId', 'firstName lastName email gender').populate('doctorId', 'firstName lastName email gender').lean();
  if (!session) throw new NotFoundError('Session');
  const userId = req.user._id.toString();
  const pId = session.patientId?._id?.toString() || session.patientId?.toString();
  const dId = session.doctorId?._id?.toString() || session.doctorId?.toString();
  if (pId !== userId && dId !== userId) throw new AuthorizationError('Unauthorized to view this session');

  // Fetch doctor profile for image
  if (session.doctorId) {
    const DoctorProfile = require('../models/doctorProfile');
    const docProfile = await DoctorProfile.findOne({ userId: session.doctorId._id }).lean();
    if (docProfile) {
      session.doctorId.profileImage = docProfile.profileImage;
    }
  }

  res.json(session);
});

/** GET /api/sessions/join/:sessionId */
const joinSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();
  const session = await Session.findById(sessionId).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email');
  if (!session) throw new NotFoundError('Session');
  const pId = session.patientId?._id?.toString() || session.patientId?.toString();
  const dId = session.doctorId?._id?.toString() || session.doctorId?.toString();
  if (pId !== userId && dId !== userId) throw new AuthorizationError('Not authorized to join this session');
  if (session.sessionType !== 'immediate' && !session.canJoin()) return res.status(400).json({ success: false, message: 'Session cannot be joined at this time. Please wait until 15 minutes before the scheduled time.' });
  res.json({ success: true, message: 'Session can be joined', session, meetingLink: session.meetingLink });
});

/** POST /api/sessions/:sessionId/complete */
const completeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();
  const session = await Session.findById(sessionId)
    .populate('patientId', 'firstName lastName email')
    .populate('doctorId', 'firstName lastName email');
  if (!session) throw new NotFoundError('Session');
  if (session.patientId?._id?.toString() !== userId && session.doctorId?._id?.toString() !== userId) throw new AuthorizationError('Unauthorized');
  if (session.status === 'completed') return res.json({ success: true, message: 'Session already marked as completed', session: { status: session.status } });
  session.status = 'completed';
  if (session.callStatus !== 'completed') { session.callStatus = 'completed'; session.callEndTime = session.callEndTime || new Date(); }
  await session.save();

  // Send doctor earnings summary email
  try {
    if (session.doctorId && session.doctorId.email) {
      const platformSettings = await PlatformSettings.getSettings();
      const doctorProfile = await DoctorProfile.findOne({ userId: session.doctorId._id });
      const feePercent = doctorProfile?.customFeePercentage ?? platformSettings.defaultPlatformFeePercentage;
      await emailService.sendDoctorSessionSummaryEmail(session.doctorId.email, {
        doctorName: `${session.doctorId.firstName} ${session.doctorId.lastName}`,
        patientName: `${session.patientId.firstName} ${session.patientId.lastName}`,
        date: new Date(session.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        duration: session.duration,
        price: session.price,
        platformFee: session.platformFee,
        earnings: session.doctorEarnings,
        feePercent
      });
    }
  } catch (emailErr) { logger.warn('Session summary email failed', { error: emailErr.message }); }

  logger.info('Session completed', { sessionId: sessionId.substring(0, 8), by: req.user.role });
  res.json({ success: true, message: 'Session marked as completed', session: { status: session.status } });
});

/** POST /api/sessions/:sessionId/cancel */
const cancelSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();
  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');
  if (session.patientId.toString() !== userId && session.doctorId.toString() !== userId) {
    throw new AuthorizationError('Not authorized to cancel this session');
  }

  const sessionDT = new Date(session.sessionDate);
  const [ch, cm] = session.sessionTime.split(':').map(Number);
  sessionDT.setHours(ch, cm, 0, 0);

  if (sessionDT.getTime() < Date.now()) {
    return res.status(400).json({ success: false, message: 'Cannot cancel a session that has already started' });
  }

  const cancellerRole = req.user.role; // 'patient' or 'doctor'
  
  // ── REFUND POLICY ─────────────────────────────────────────────────────────
  const hoursUntil = (sessionDT.getTime() - Date.now()) / (1000 * 60 * 60);
  
  let refundAmount = 0;
  if (cancellerRole === 'doctor') {
    refundAmount = session.price; // Doctor cancels → 100% refund always
  } else if (cancellerRole === 'patient') {
    if (hoursUntil > 24) {
      refundAmount = session.price;                         // >24h → 100%
    } else if (hoursUntil > 4) {
      refundAmount = Math.round(session.price * 0.5);      // 4-24h → 50%
    } else {
      refundAmount = 0;                                     // <4h → 0%
    }
  }

  session.status = 'cancelled';
  session.cancelledBy = cancellerRole;

  // ── PROCESS REFUND ────────────────────────────────────────────────────────
  const isRealPayment = session.paymentId && 
    !session.paymentId.startsWith('mock_') && 
    !session.paymentId.startsWith('immediate_');

  if (session.paymentStatus === 'paid' && isRealPayment && refundAmount > 0) {
    session.paymentStatus = 'refund_pending';
    await session.save(); // Save pending state first
    
    try {
      const refund = await razorpay.payments.refund(session.paymentId, {
        amount: refundAmount * 100, // In paise
        speed: 'normal',
        notes: { reason: `Cancelled by ${cancellerRole}`, sessionId: sessionId }
      });
      session.paymentStatus = 'refunded';
      session.refundId = refund.id;
      session.refundedAt = new Date();
      session.refundAmount = refundAmount;
    } catch (err) {
      logger.error('Razorpay refund failed', { error: err.message, paymentId: session.paymentId });
      session.paymentStatus = 'refund_failed';
    }
  } else if (refundAmount === 0) {
    session.paymentStatus = 'paid'; // No refund owed, payment stays as-is
  } else {
    session.paymentStatus = 'refunded'; // Mock/immediate payments — mark refunded
    session.refundAmount = session.price;
  }

  await session.save();

  // Release the slot
  try {
    const avail = await DoctorAvailability.findOne({ doctorId: session.doctorId });
    if (avail) await avail.releaseSlot(session.sessionDate.toISOString().split('T')[0], session.sessionTime);
  } catch (e) { logger.warn('Slot release failed', { error: e.message }); }

  // Notify both parties via socket
  const pId = session.patientId.toString();
  const dId = session.doctorId.toString();
  _emitToUsers(req, 'session:cancelled', {
    sessionId: session._id.toString(), 
    cancelledBy: userId, 
    refundAmount,
    timestamp: new Date()
  }, [pId, dId]);

  // Send cancellation emails to both parties
  try {
    const populatedSession = await Session.findById(session._id)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');
    const sessionDate = new Date(session.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const cancellerLabel = cancellerRole === 'doctor' ? 'Dr. ' + populatedSession.doctorId.firstName + ' ' + populatedSession.doctorId.lastName : populatedSession.patientId.firstName + ' ' + populatedSession.patientId.lastName;
    
    // Email patient
    if (populatedSession.patientId?.email) {
      await emailService.sendCancellationEmail(populatedSession.patientId.email, {
        recipientName: populatedSession.patientId.firstName,
        date: sessionDate,
        time: session.sessionTime,
        cancelledBy: cancellerLabel,
        refundAmount,
        message: cancellerRole === 'doctor'
          ? `We're sorry, your session has been cancelled by the doctor. A full refund will be processed.`
          : `Your session has been cancelled.`
      });
    }
    // Email doctor
    if (populatedSession.doctorId?.email) {
      await emailService.sendCancellationEmail(populatedSession.doctorId.email, {
        recipientName: `Dr. ${populatedSession.doctorId.firstName} ${populatedSession.doctorId.lastName}`,
        date: sessionDate,
        time: session.sessionTime,
        cancelledBy: cancellerLabel,
        refundAmount: 0, // No refund info for doctor
        message: cancellerRole === 'patient'
          ? `The patient has cancelled their upcoming session.`
          : `You have cancelled your session with ${populatedSession.patientId.firstName} ${populatedSession.patientId.lastName}.`
      });
    }
  } catch (emailErr) { logger.warn('Cancellation email failed', { error: emailErr.message }); }

  logger.info('Session cancelled', { sessionId: sessionId.substring(0, 8) });

  res.json({
    success: true,
    message: 'Session cancelled successfully',
    refundAmount,
    refundPolicy: refundAmount === session.price ? '100% refund' : 
                  refundAmount === 0 ? 'No refund (cancelled <4h before session)' :
                  '50% refund (cancelled 4-24h before session)'
  });
});


/** GET /api/sessions/calendar/:year/:month */
const getCalendar = asyncHandler(async (req, res) => {
  const { year, month } = req.params;
  const userId = req.user._id.toString();
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(yearNum, monthNum, 1));
  const query = { sessionDate: { $gte: startDate, $lt: endDate }, ...(req.user.role === 'patient' ? { patientId: userId } : { doctorId: userId }) };
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ sessionDate: 1, sessionTime: 1 });

  const enrichedSessions = await attachDoctorProfiles(sessions);
  res.json(enrichedSessions);
});

/** GET /api/sessions/patients/:patientId/emergency-contact */
const getPatientEmergencyContact = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can access emergency contacts');
  const { patientId } = req.params;
  const hasSession = await Session.findOne({ doctorId: req.user._id, patientId });
  if (!hasSession) throw new AuthorizationError('You can only view emergency contacts for your patients');
  const patient = await User.findById(patientId).select('firstName lastName emergencyContact');
  if (!patient) throw new NotFoundError('Patient');
  res.json({ success: true, patientName: `${patient.firstName} ${patient.lastName}`, emergencyContact: patient.emergencyContact });
});

/** GET /api/sessions/my-therapists */
const getMyTherapists = asyncHandler(async (req, res) => {
  if (req.user.role !== 'patient') throw new AuthorizationError('Only patients can access this endpoint');
  const patientId = req.user._id.toString();
  const sessions = await Session.find({ patientId, status: { $in: ['completed', 'scheduled'] } }).populate('doctorId', 'firstName lastName email').sort({ sessionDate: -1 });
  const map = {};
  sessions.forEach(s => {
    if (!s.doctorId) return;
    const dId = s.doctorId._id.toString();
    if (!map[dId]) map[dId] = { doctor: { _id: s.doctorId._id, firstName: s.doctorId.firstName, lastName: s.doctorId.lastName, email: s.doctorId.email }, totalSessions: 0, completedSessions: 0, upcomingSessions: 0, lastSession: null, nextSession: null };
    map[dId].totalSessions++;
    if (s.status === 'completed') { map[dId].completedSessions++; if (!map[dId].lastSession || s.sessionDate > map[dId].lastSession) map[dId].lastSession = s.sessionDate; }
    else { map[dId].upcomingSessions++; if (!map[dId].nextSession || s.sessionDate < map[dId].nextSession) map[dId].nextSession = s.sessionDate; }
  });

  // Batch fetch all doctor profiles in ONE query instead of N separate findOne calls
  const doctorIds = Object.keys(map);
  const profiles = await DoctorProfile.find({ userId: { $in: doctorIds } }).select('userId specialization experience qualification profileImage languages pricing rating');
  const profileMap = {};
  profiles.forEach(p => { profileMap[p.userId.toString()] = p; });

  const therapists = Object.values(map).map(t => ({
    ...t,
    profile: profileMap[t.doctor._id.toString()] || null
  }));
  res.json(therapists);
});

/** POST /api/sessions/:sessionId/accept — Doctor accepts instant session */
const acceptSession = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can accept sessions');
  const { sessionId } = req.params;
  const userId = req.user._id.toString();
  const session = await Session.findById(sessionId).populate('patientId', 'firstName lastName').populate('doctorId', 'firstName lastName');
  if (!session) throw new NotFoundError('Session');
  if (session.doctorId._id.toString() !== userId) throw new AuthorizationError('You are not assigned to this session');
  session.acceptanceStatus = 'accepted';
  session.status = 'scheduled';
  await session.save();
  const updateData = { sessionId, acceptanceStatus: 'accepted', message: 'Doctor has accepted the request and is joining.' };
  _emitToUsers(req, 'session:status-update', updateData, [session.patientId._id.toString(), userId]);
  const io = req.app.get('io');
  if (io) io.to(sessionId).emit('session:status-update', updateData);
  res.json({ success: true, message: 'Session accepted successfully', session });
});

/** POST /api/sessions/:sessionId/delay — Doctor delays instant session */
const delaySession = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can delay sessions');
  const { sessionId } = req.params;
  const { delayMinutes, doctorNote } = req.body;
  const userId = req.user._id.toString();
  const session = await Session.findById(sessionId).populate('patientId', 'firstName lastName').populate('doctorId', 'firstName lastName');
  if (!session) throw new NotFoundError('Session');
  if (session.doctorId._id.toString() !== userId) throw new AuthorizationError('You are not assigned to this session');
  session.acceptanceStatus = 'delayed';
  session.delayMinutes = delayMinutes || 5;
  session.delayedUntil = new Date(Date.now() + session.delayMinutes * 60000);
  session.doctorNote = doctorNote || '';
  await session.save();
  const updateData = { sessionId, acceptanceStatus: 'delayed', delayMinutes: session.delayMinutes, delayedUntil: session.delayedUntil, doctorNote: session.doctorNote, message: `Doctor will join in ${session.delayMinutes} minutes.` };
  _emitToUsers(req, 'session:status-update', updateData, [session.patientId._id.toString(), userId]);
  const io = req.app.get('io');
  if (io) io.to(sessionId).emit('session:status-update', updateData);
  res.json({ success: true, message: 'Session delayed successfully', session });
});

/** POST /api/sessions/:sessionId/missed — Handle when doctor misses the ring or delay timeout */
const missedSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const session = await Session.findById(sessionId).populate('patientId', 'firstName lastName').populate('doctorId', 'firstName lastName');
  if (!session) throw new NotFoundError('Session');
  
  if (session.acceptanceStatus === 'accepted') {
    return res.json({ success: false, message: 'Session already accepted' });
  }

  session.status = 'cancelled';
  session.acceptanceStatus = 'pending';

  if (session.paymentStatus === 'paid' && session.paymentId && !session.paymentId.startsWith('mock_') && !session.paymentId.startsWith('immediate_')) {
    try {
      await razorpay.payments.refund(session.paymentId, {
        amount: session.price * 100,
        speed: 'normal',
        notes: { reason: 'Doctor missed session — auto refund' }
      });
      session.paymentStatus = 'refunded';
      session.refundAmount = session.price;
    } catch (err) {
      logger.error('Razorpay refund failed in missedSession', { error: err.message, paymentId: session.paymentId });
      session.paymentStatus = 'refund_failed';
    }
  } else {
    session.paymentStatus = 'refunded';
  }

  await session.save();

  // Notify patient about missed session & refund via email
  try {
    const populatedMissed = await Session.findById(sessionId).populate('patientId', 'firstName lastName email');
    if (populatedMissed.patientId?.email) {
      await emailService.sendCancellationEmail(populatedMissed.patientId.email, {
        recipientName: populatedMissed.patientId.firstName,
        date: new Date(session.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: session.sessionTime,
        cancelledBy: 'System (Doctor Unavailable)',
        refundAmount: session.price,
        message: 'Unfortunately your doctor was unavailable for your session. A full refund has been initiated automatically.'
      });
    }
  } catch (e) { logger.warn('Missed session email failed', { error: e.message }); }

  const updateData = { sessionId, status: 'cancelled', cancelledBy: 'system', message: 'Doctor is unavailable. Session cancelled and refunded.' };
  _emitToUsers(req, 'session:cancelled', updateData, [session.patientId._id.toString(), session.doctorId._id.toString()]);
  const io = req.app.get('io');
  if (io) io.to(sessionId).emit('session:cancelled', updateData);
  
  res.json({ success: true, message: 'Session marked as missed', session });
});

/** GET /api/sessions/delayed — Get all active delayed sessions for a doctor */
const getDelayedSessions = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') return res.json({ sessions: [] });
  const userId = req.user._id.toString();
  
  // Find sessions that are delayed and the delayedUntil time hasn't passed by more than 15 minutes
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60000);
  
  const sessions = await Session.find({
    doctorId: userId,
    acceptanceStatus: 'delayed',
    delayedUntil: { $gte: fifteenMinsAgo },
    status: { $nin: ['cancelled', 'completed'] }
  }).populate('patientId', 'firstName lastName profileImage');
  
  res.json({ success: true, sessions });
});
/** GET /api/sessions/turn-credentials */
const getTurnCredentials = asyncHandler(async (req, res) => {
  const domain = process.env.METERED_DOMAIN;
  const secretKey = process.env.METERED_SECRET_KEY;
  
  const fallbackServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  if (!domain || !secretKey) {
    logger.warn('Metered TURN credentials not configured in environment variables');
    return res.json({ success: true, iceServers: fallbackServers });
  }

  try {
    const response = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${secretKey}`);
    if (!response.ok) throw new Error('Failed to fetch from Metered API');
    const data = await response.json();
    
    // Add STUN servers as a fallback just in case
    const iceServers = [ ...fallbackServers, ...data ];
    res.json({ success: true, iceServers });
  } catch (error) {
    logger.error('Error fetching TURN credentials', { error: error.message });
    res.json({ success: true, iceServers: fallbackServers });
  }
});

module.exports = { getStats, getMyDoctors, getPendingFeedback, getCallHistory, getDoctorSlots, bookImmediate, bookSession, getMySessions, getUpcoming, getAllDoctors, getDoctorById, getSessionById, joinSession, completeSession, cancelSession, getCalendar, getPatientEmergencyContact, getMyTherapists, acceptSession, delaySession, getTurnCredentials, missedSession, getDelayedSessions };
