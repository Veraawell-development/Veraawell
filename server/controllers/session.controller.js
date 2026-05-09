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
const SocketEmitter = require('../utils/socketEmitter');
const { updateSessionStatuses } = require('../utils/sessionUpdater');
const { calculateSessionPrice, getOrCreateAvailability, getGenderBasedImage } = require('../services/session.service');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-CTRL');

const SESSION_TYPE_MAP = { scheduled: 'regular', regular: 'regular', discovery: 'discovery', 'follow-up': 'follow-up', immediate: 'immediate' };
const CALL_MODE_MAP = { video: 'Video Calling', voice: 'Voice Calling' };

function _emitToUsers(req, event, data, userIds) {
  const io = req.app.get('io');
  if (io) new SocketEmitter(io).emitToUsers(userIds, event, data);
}

/** GET /api/sessions/stats — Doctor session statistics */
const getStats = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Access denied');
  const userId = req.user._id.toString();
  await updateSessionStatuses();
  const stats = await Session.aggregate([
    { $match: { doctorId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
    { $group: { _id: null, totalRevenue: { $sum: '$price' }, totalSessions: { $count: {} }, totalDurationMinutes: { $sum: '$duration' } } }
  ]);
  const r = stats[0] || { totalRevenue: 0, totalSessions: 0, totalDurationMinutes: 0 };
  res.json({ success: true, totalRevenue: r.totalRevenue, totalSessions: r.totalSessions, totalHours: Math.round(r.totalDurationMinutes / 60) });
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
  await updateSessionStatuses();
  const query = userRole === 'patient' ? { patientId: userId } : { doctorId: userId };
  const callHistory = await Session.find({ ...query, $or: [{ status: { $in: ['completed', 'cancelled'] } }, { callStatus: { $in: ['in-progress', 'completed'] } }, { callStartTime: { $exists: true, $ne: null } }] })
    .populate('patientId', 'firstName lastName').populate('doctorId', 'firstName lastName').select('+rating').sort({ sessionDate: -1, sessionTime: -1 }).lean();
  const formatted = callHistory.map(s => ({
    _id: s._id,
    name: userRole === 'patient' ? (s.doctorId ? `Dr. ${s.doctorId.firstName} ${s.doctorId.lastName}` : 'Test Session (Self)') : (s.patientId ? `${s.patientId.firstName} ${s.patientId.lastName}` : 'Test Session (Self)'),
    date: s.sessionDate, duration: s.actualDuration || s.duration, mode: s.status === 'cancelled' ? 'Cancelled & Refunded' : (s.callMode || 'Video Calling'),
    paymentAmount: s.price, paymentStatus: s.paymentStatus, sessionType: s.sessionType, status: s.status, callStatus: s.callStatus, rating: s.rating
  }));
  res.json(formatted);
});

/** GET /api/sessions/doctors/:doctorId/slots/:date */
const getDoctorSlots = asyncHandler(async (req, res) => {
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
  const sessionDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const sessionTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const finalPrice = await calculateSessionPrice(doctorId, mode, duration, price);

  const session = new Session({ patientId, doctorId, sessionDate: new Date(sessionDate), sessionTime, sessionType: 'immediate', duration: duration || 20, price: finalPrice, paymentStatus: 'paid', paymentId: `immediate_${Date.now()}`, callMode: CALL_MODE_MAP[mode] || 'Video Calling' });
  const saved = await session.save();
  saved.meetingLink = `/video-call/${saved._id}`;
  await saved.save();

  const populated = await Session.findById(session._id).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email');

  try { await Conversation.findOrCreateConversation(patientId, doctorId, saved._id); } catch (e) { logger.warn('Conversation creation failed', { error: e.message }); }

  _emitToUsers(req, 'session:booked', { session: populated, patientId, doctorId, sessionId: saved._id.toString(), timestamp: new Date() }, [patientId, doctorId]);
  logger.info('Immediate session booked', { sessionId: saved._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, message: 'Immediate session booked. You can join now.', session: populated });
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

  const meetingLink = `/video-call/${crypto.randomBytes(16).toString('hex')}`;
  const session = new Session({
    patientId, doctorId, sessionDate: new Date(sessionDate), sessionTime,
    sessionType: SESSION_TYPE_MAP[sessionType] || 'regular', duration: duration || 60,
    price: finalPrice, paymentStatus: 'paid', paymentId: `mock_payment_${Date.now()}`,
    meetingLink, sessionNotes: `Service Type: ${serviceType || 'General'}`,
    callMode: CALL_MODE_MAP[mode] || 'Video Calling'
  });

  const booked = await availability.bookSlot(sessionDate, sessionTime, session._id);
  if (!booked) return res.status(400).json({ success: false, message: 'Failed to book slot. It may have just been taken.' });

  await session.save();
  const populated = await Session.findById(session._id).populate('patientId', 'firstName lastName email phoneNumber').populate('doctorId', 'firstName lastName email');

  try {
    const { sendSMS } = require('../services/twilioService');
    if (populated.patientId.phoneNumber) {
      const d = new Date(populated.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      await sendSMS(populated.patientId.phoneNumber, `Hi ${populated.patientId.firstName}! Your session has been confirmed. Date: ${d}, Time: ${populated.sessionTime}, Doctor: Dr. ${populated.doctorId.firstName} ${populated.doctorId.lastName}. - Veerawell`);
    }
  } catch (smsErr) { logger.warn('SMS send failed', { error: smsErr.message }); }

  try { await Conversation.findOrCreateConversation(patientId, doctorId, session._id); } catch (e) { logger.warn('Conversation creation failed', { error: e.message }); }

  _emitToUsers(req, 'session:booked', { session: populated, patientId, doctorId, sessionId: session._id.toString(), timestamp: new Date() }, [patientId, doctorId]);
  logger.info('Session booked', { sessionId: session._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, message: 'Session booked successfully', session: populated });
});

/** GET /api/sessions/my-sessions */
const getMySessions = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const query = req.user.role === 'patient' ? { patientId: userId } : { doctorId: userId };
  await updateSessionStatuses();
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ sessionDate: 1, sessionTime: 1 });
  res.json(sessions);
});

/** GET /api/sessions/upcoming */
const getUpcoming = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const query = { status: 'scheduled', sessionDate: { $gte: new Date() }, ...(req.user.role === 'patient' ? { patientId: userId } : { doctorId: userId }) };
  await updateSessionStatuses();
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ sessionDate: 1, sessionTime: 1 }).limit(10);
  res.json(sessions);
});

/** GET /api/sessions/doctors — All doctors with profiles (public) */
const getAllDoctors = asyncHandler(async (req, res) => {
  const profiles = await DoctorProfile.find({}).populate('userId', 'firstName lastName email isOnline profileCompleted');
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
  const session = await Session.findById(req.params.sessionId).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email');
  if (!session) throw new NotFoundError('Session');
  const userId = req.user._id.toString();
  const pId = session.patientId?._id?.toString() || session.patientId?.toString();
  const dId = session.doctorId?._id?.toString() || session.doctorId?.toString();
  if (pId !== userId && dId !== userId) throw new AuthorizationError('Unauthorized to view this session');
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
  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');
  if (session.patientId?.toString() !== userId && session.doctorId?.toString() !== userId) throw new AuthorizationError('Unauthorized');
  if (session.status === 'completed') return res.json({ success: true, message: 'Session already marked as completed', session: { status: session.status } });
  session.status = 'completed';
  if (session.callStatus !== 'completed') { session.callStatus = 'completed'; session.callEndTime = session.callEndTime || new Date(); }
  await session.save();
  logger.info('Session completed', { sessionId: sessionId.substring(0, 8), by: req.user.role });
  res.json({ success: true, message: 'Session marked as completed', session: { status: session.status } });
});

/** POST /api/sessions/:sessionId/cancel */
const cancelSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();
  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');
  if (session.patientId.toString() !== userId && session.doctorId.toString() !== userId) throw new AuthorizationError('Not authorized to cancel this session');
  const sessionDT = new Date(session.sessionDate);
  const [ch, cm] = session.sessionTime.split(':').map(Number);
  sessionDT.setHours(ch, cm, 0, 0);
  if ((sessionDT.getTime() - Date.now()) / (1000 * 60 * 60) < 24) return res.status(400).json({ success: false, message: 'Sessions can only be cancelled 24 hours in advance' });
  session.status = 'cancelled';
  session.paymentStatus = 'refunded';
  await session.save();
  try {
    const avail = await DoctorAvailability.findOne({ doctorId: session.doctorId });
    if (avail) await avail.releaseSlot(session.sessionDate.toISOString().split('T')[0], session.sessionTime);
  } catch (e) { logger.warn('Slot release failed during cancellation', { error: e.message }); }
  const pId = session.patientId.toString();
  const dId = session.doctorId.toString();
  _emitToUsers(req, 'session:cancelled', { sessionId: session._id.toString(), patientId: pId, doctorId: dId, cancelledBy: userId, timestamp: new Date() }, [pId, dId]);
  logger.info('Session cancelled', { sessionId: sessionId.substring(0, 8) });
  res.json({ success: true, message: 'Session cancelled successfully' });
});

/** GET /api/sessions/calendar/:year/:month */
const getCalendar = asyncHandler(async (req, res) => {
  const { year, month } = req.params;
  const userId = req.user._id.toString();
  const query = { sessionDate: { $gte: new Date(year, month - 1, 1), $lte: new Date(year, month, 0) }, ...(req.user.role === 'patient' ? { patientId: userId } : { doctorId: userId }) };
  await updateSessionStatuses();
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ sessionDate: 1, sessionTime: 1 });
  res.json(sessions);
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
  const therapists = await Promise.all(Object.values(map).map(async t => {
    const profile = await DoctorProfile.findOne({ userId: t.doctor._id }).select('specialization experience qualification profileImage');
    return { ...t, profile: profile || null };
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
  session.doctorNote = doctorNote || '';
  await session.save();
  const updateData = { sessionId, acceptanceStatus: 'delayed', delayMinutes: session.delayMinutes, doctorNote: session.doctorNote, message: `Doctor will join in ${session.delayMinutes} minutes.` };
  _emitToUsers(req, 'session:status-update', updateData, [session.patientId._id.toString(), userId]);
  const io = req.app.get('io');
  if (io) io.to(sessionId).emit('session:status-update', updateData);
  res.json({ success: true, message: 'Session delayed successfully', session });
});

module.exports = { getStats, getMyDoctors, getPendingFeedback, getCallHistory, getDoctorSlots, bookImmediate, bookSession, getMySessions, getUpcoming, getAllDoctors, getDoctorById, getSessionById, joinSession, completeSession, cancelSession, getCalendar, getPatientEmergencyContact, getMyTherapists, acceptSession, delaySession };
