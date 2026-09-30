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
const { PUBLIC_DOCTOR_FIELDS } = require('../models/doctorProfile');
const DoctorAvailability = require('../models/doctorAvailability');
const Review = require('../models/review');
const PlatformSettings = require('../models/platformSettings');
const SocketEmitter = require('../utils/socketEmitter');

const { calculateSessionPrice, getOrCreateAvailability, getGenderBasedImage } = require('../services/session.service');
const { calculateRefund, describeRefundPolicy } = require('../services/refundPolicy');
const { resolveStartsAt, hoursUntilStart } = require('../services/sessionTime');
const { payableSessionMatch } = require('../services/earnings');
const { zonedToUtc, slotKey } = require('../utils/zonedTime');
const { PLATFORM_TIMEZONE, CHECKOUT_TTL_MINUTES, INSTANT_ACCEPT_WINDOW_MINUTES } = require('../config/time');
const { asyncHandler } = require('../middleware/error.middleware');
const { applyTransition } = require('../services/sessionTransition');
const { EVENT, ACTOR } = require('../services/sessionState');
const { refundSession } = require('../services/sessionRefund');
const { sealedFilter } = require('../authz');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { getRazorpay } = require('../services/razorpay.client');
const { isStubMode } = require('../config/payments');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-CTRL');
const emailService = require('../services/email.service');

const SESSION_TYPE_MAP = { scheduled: 'regular', regular: 'regular', discovery: 'discovery', 'follow-up': 'follow-up', immediate: 'immediate' };
const CALL_MODE_MAP = { video: 'Video Calling', voice: 'Voice Calling' };

function _emitToUsers(req, event, data, userIds) {
  const io = req.app.get('io');
  if (io) new SocketEmitter(io).emitToUsers(userIds, event, data);
}

/**
 * Decide the payment state a new booking starts in, and create the Razorpay
 * order when one is owed.
 *
 * Shared by bookSession and bookImmediate, which previously had two copies of
 * this logic that both ended in the same defect: on any failure to create an
 * order they fell through to `paymentStatus: 'paid'` with a synthetic
 * `mock_payment_<ts>` id, producing a confirmed session for ₹0.
 *
 * The states this can return, and why 'paid' is not among them:
 *   - not_required : nothing is owed (a free session, or stub payments mode).
 *                    Honest about the fact that no money moved, which matters
 *                    because a later cancellation of a 'paid' session with no
 *                    real paymentId is what let a refund be fabricated.
 *   - pending      : an order exists and the patient must complete checkout.
 *                    Only a verified signature (POST /api/payments/verify) or
 *                    the Razorpay webhook may promote this to 'paid'.
 * Anything else is a failed request.
 *
 * @returns {Promise<{ok:true, paymentStatus:string, status:string, paymentId:string|null, razorpayOrderId:string|null}
 *                  | {ok:false, httpStatus:number, message:string}>}
 */
async function resolveBookingPaymentState({ doctorProfile, finalPrice, receiptPrefix, immediate = false }) {
  const scheduledStatus = immediate ? 'active' : 'scheduled';

  // Genuinely free (e.g. a discovery call priced at 0). Nothing to collect.
  if (!finalPrice || finalPrice <= 0) {
    return { ok: true, paymentStatus: 'not_required', status: scheduledStatus, paymentId: null, razorpayOrderId: null };
  }

  if (isStubMode()) {
    logger.warn('STUB PAYMENTS: creating a not_required session — this mode is refused in production', {
      price: finalPrice
    });
    return {
      ok: true,
      paymentStatus: 'not_required',
      status: scheduledStatus,
      paymentId: `stub_${crypto.randomBytes(8).toString('hex')}`,
      razorpayOrderId: null
    };
  }

  // ── Live mode. Both branches below are explicit failures, never a downgrade.
  //
  // The gate used to be "does this doctor have a non-synthetic
  // razorpayAccountId", because the order below carried a Razorpay Route
  // `transfers[]` split that needs a real linked account. Two things killed
  // that design:
  //
  //   - Route now requires the platform to clear an RBI Payment Aggregator
  //     turnover bar (>Rs.40L domestic), which this platform does not meet, and
  //     the onboarding flow only ever implemented 1 of the 4 API calls a linked
  //     account needs, so no account could have become transfer-capable anyway.
  //   - approveOnboarding fabricated `acc_mock_<hex>` whenever the Razorpay
  //     call threw and marked the doctor 'active'. So the gate answered "yes,
  //     Razorpay knows them" for doctors nobody could pay, and "no" for
  //     everyone else — every doctor on the platform was unbookable while their
  //     own settings page said payouts were live.
  //
  // Money now lands wholly in the platform account and doctors are paid by
  // bank transfer on a weekly cycle. So the question the gate asks changes
  // from "can Razorpay route to them" to "has an admin approved a way to pay
  // them" — which is what payoutApproved records. Same fail-closed posture:
  // the platform never takes money for a session it has no way to settle.
  if (!doctorProfile || doctorProfile.payoutApproved !== true) {
    logger.error('Booking rejected: doctor is not approved for payouts', {
      hasProfile: !!doctorProfile,
      payoutApproved: doctorProfile ? doctorProfile.payoutApproved : undefined
    });
    return {
      ok: false,
      httpStatus: 409,
      message: 'This therapist is not yet set up to receive payments. Please choose another therapist or try again later.'
    };
  }

  // No `transfers[]`: this is a plain order into the platform's own account.
  // The commission split is still computed and stored on the Session
  // (platformFee / doctorEarnings) — it is settled by the weekly payout run
  // rather than by the gateway.
  const orderPayload = {
    amount: Math.round(finalPrice * 100),
    currency: 'INR',
    receipt: `${receiptPrefix}_${Date.now()}`,
    notes: { branch: 'Veraawell Session' }
  };

  try {
    const order = await getRazorpay().orders.create(orderPayload);
    return {
      ok: true,
      paymentStatus: 'pending',
      status: 'payment_pending',
      paymentId: null,
      razorpayOrderId: order.id
    };
  } catch (err) {
    // Previously a logger.warn followed by a free session. A gateway outage
    // must not silently become free therapy.
    logger.error('Razorpay order creation failed — booking rejected', { error: err.message });
    return {
      ok: false,
      httpStatus: 502,
      message: 'Payment gateway is temporarily unavailable. Please try again in a moment.'
    };
  }
}

/**
 * Shared by both the explicit doctor-cancellation path (cancelSession) and the
 * auto-cancel-on-no-show path (_autoCancelUnacceptedSession) — previously each
 * had its own copy-pasted copy of this increment-and-warn logic.
 */
async function _incrementDoctorCancellationCount(doctorId, warnMessageOnFailure) {
  try {
    const docProfile = await DoctorProfile.findOne({ userId: doctorId });
    if (docProfile) {
      docProfile.cancellationCount = (docProfile.cancellationCount || 0) + 1;
      docProfile.lastCancellationDate = new Date();
      if (docProfile.cancellationCount >= 3) {
        docProfile.cancellationWarningIssued = true;
        logger.warn(`Doctor ${doctorId} has reached ${docProfile.cancellationCount} cancellations.`);
      }
      await docProfile.save();
    }
  } catch (err) {
    logger.warn(warnMessageOnFailure, { error: err.message });
  }
}

/** GET /api/sessions/stats — Doctor session statistics + earnings breakdown */
const getStats = asyncHandler(async (req, res) => {
  const userId = req.actor.id;

  const [overallStats, recentEarnings] = await Promise.all([
    Session.aggregate([
      // The shared payable predicate, so what the doctor is SHOWN here is
      // exactly what the weekly payout run will pay them. These used to be
      // three different filters in three files.
      { $match: payableSessionMatch({ doctorId: userId }) },
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
          ...payableSessionMatch({ doctorId: userId }),
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

  // What the doctor is owed but has not been paid.
  //
  // Keyed on `payoutId`, not `razorpayTransferId`. The old field was set only
  // by Razorpay Route's transfer.processed webhook, and Route is gone — so
  // nothing would ever have cleared it and this figure could only count up
  // forever, whatever had actually been paid.
  const pendingPayout = await Session.aggregate([
    { $match: payableSessionMatch({ doctorId: userId, unpaidOnly: true }) },
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
  const userId = req.actor.id;
  const previousDoctors = await Session.aggregate([
    { $match: { patientId: new mongoose.Types.ObjectId(userId), status: { $in: ['completed', 'ended'] } } },
    { $group: { _id: '$doctorId', sessionCount: { $sum: 1 }, lastSession: { $max: '$sessionDate' } } },
    { $sort: { sessionCount: -1, lastSession: -1 } },
    { $limit: 3 }
  ]);
  if (!previousDoctors.length) return res.json([]);
  const doctors = await DoctorProfile.find({ userId: { $in: previousDoctors.map(d => d._id) } })
    .select(PUBLIC_DOCTOR_FIELDS).populate('userId', 'firstName lastName email').lean();
  const result = doctors.map(d => {
    const stats = previousDoctors.find(p => p._id.equals(d.userId._id));
    return { ...d, sessionCount: stats?.sessionCount || 0, lastSessionDate: stats?.lastSession || null };
  });
  res.json(result);
});

/** GET /api/sessions/pending-feedback — Sessions needing patient review */
const getPendingFeedback = asyncHandler(async (req, res) => {
  if (req.actor.role !== 'patient') return res.json({ session: null });
  const userId = req.actor.id;
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
  const userId = req.actor.id;
  const userRole = req.actor.role;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const callHistory = await Session.find({ ...req.authz.scope, $or: [{ status: { $in: ['completed', 'cancelled'] } }, { callStatus: { $in: ['in-progress', 'completed'] } }, { callStartTime: { $exists: true, $ne: null } }] })
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
    const cutoff = new Date(Date.now() - CHECKOUT_TTL_MINUTES * 60 * 1000);
    const pendingSessions = await Session.find({
      paymentStatus: 'pending',
      createdAt: { $lt: cutoff }
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
  const patientId = req.actor.id;
  if (!doctorId || doctorId === 'test-doctor-id') doctorId = patientId;

  const now = new Date();
  // sessionTime used to be built from getUTCHours(), producing a bare 24-hour
  // string ('14:30') that no other producer emitted — so it could never match
  // a slot in the 12-hour availability grid, and releaseSlot was a guaranteed
  // no-op for immediate sessions. The model now derives every representation
  // from `startsAt`; this literal is only a placeholder for the required field.
  const sessionTime = '12:00 AM';
  const finalPrice = await calculateSessionPrice(doctorId, mode, duration, price);

  let platformFee = 0;
  let doctorEarnings = 0;
  let doctorProfile = null;

  const isSelfSession = doctorId === patientId;
  if (!isSelfSession) {
    doctorProfile = await DoctorProfile.findOne({ userId: doctorId });
    if (doctorProfile) {
      const platformSettings = await PlatformSettings.getSettings();
      const feePercentage = doctorProfile.customFeePercentage ?? platformSettings.defaultPlatformFeePercentage;
      platformFee = Math.round((finalPrice * feePercentage) / 100);
      doctorEarnings = finalPrice - platformFee;
    }
  }

  // Same fail-closed rule as bookSession — see resolveBookingPaymentState.
  // A self-session (doctorId === patientId, reachable via the 'test-doctor-id'
  // sentinel) owes nothing, so it resolves to not_required rather than being
  // dressed up as a completed payment.
  const paymentState = isSelfSession
    ? { ok: true, paymentStatus: 'not_required', status: 'active', paymentId: null, razorpayOrderId: null }
    : await resolveBookingPaymentState({
        doctorProfile, finalPrice, receiptPrefix: 'rcpt_imm', immediate: true
      });

  if (!paymentState.ok) {
    return res.status(paymentState.httpStatus).json({ success: false, message: paymentState.message });
  }
  const razorpayOrderId = paymentState.razorpayOrderId;

  const session = new Session({
    patientId,
    doctorId,
    startsAt: now,
    timezone: PLATFORM_TIMEZONE,
    sessionDate: now,
    sessionTime,
    sessionType: 'immediate',
    duration: duration || 20,
    price: finalPrice,
    platformFee,
    doctorEarnings,
    paymentStatus: paymentState.paymentStatus,
    status: paymentState.status,
    paymentId: paymentState.paymentId,
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
      const sessionDateFormatted = new Date(saved.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      
      if (populated.patientId && populated.patientId.email) {
        await emailService.sendBookingConfirmationEmail(populated.patientId.email, {
          date: sessionDateFormatted,
          time: saved.sessionTime,
          type: saved.sessionType || 'Immediate'
        });
      }
      
      if (populated.doctorId && populated.doctorId.email) {
        await emailService.sendDoctorNewBookingEmail(populated.doctorId.email, {
          patientName: `${populated.patientId.firstName} ${populated.patientId.lastName}`,
          date: sessionDateFormatted,
          time: saved.sessionTime,
          type: saved.sessionType || 'Immediate'
        });
      }
    }
  } catch (emailErr) { 
    logger.warn('Email send failed in bookImmediate', { error: emailErr.message, stack: emailErr.stack }); 
  }

  logger.info('Immediate session order created', { sessionId: saved._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, message: 'Immediate session order created.', session: populated });
});

/** POST /api/sessions/book — Book a scheduled session */
const bookSession = asyncHandler(async (req, res) => {
  const { doctorId, sessionDate, sessionTime, sessionType, price, mode, duration, serviceType } = req.body;
  const patientId = req.actor.id;

  if (!doctorId || !sessionDate || !sessionTime || price === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  // Validate the slot is in the future.
  //
  // This used to be `new Date(sessionDate).setHours(h, m)`, which applies the
  // SERVER's offset to a UTC-midnight date. On a UTC host that read a 9:00 AM
  // IST slot as 09:00Z — 2:30 PM IST — so slots up to 5h30m in the past were
  // bookable and genuinely-available early slots were rejected.
  let requestedStartsAt;
  try {
    requestedStartsAt = zonedToUtc(sessionDate, sessionTime, PLATFORM_TIMEZONE);
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Invalid session date or time' });
  }
  if (requestedStartsAt < new Date()) return res.status(400).json({ success: false, message: 'Cannot book a time slot in the past' });

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
  const feePercentage = doctorProfile.customFeePercentage ?? platformSettings.defaultPlatformFeePercentage;
  const platformFee = Math.round((finalPrice * feePercentage) / 100);
  const doctorEarnings = finalPrice - platformFee;

  // ── PAYMENT STATE ─────────────────────────────────────────────────────────
  // This block used to fall through to `paymentStatus: 'paid'` with a
  // fabricated `mock_payment_<ts>` id in three situations: the doctor had no
  // razorpayAccountId, the account id was a fake `acc_mock_...` (which
  // approveOnboarding writes whenever the Razorpay SDK errors), or order
  // creation threw and was swallowed by a `logger.warn`. Any of those handed
  // the patient a confirmed, joinable session for ₹0 while the doctor's
  // earnings ledger booked revenue that never arrived.
  //
  // Payment failure is now a failed request. The only way to get a session
  // that owes nothing is for it to genuinely owe nothing.
  const paymentState = await resolveBookingPaymentState({
    doctorProfile, finalPrice, receiptPrefix: 'rcpt'
  });
  if (!paymentState.ok) {
    return res.status(paymentState.httpStatus).json({ success: false, message: paymentState.message });
  }

  const meetingLink = `/video-call/${crypto.randomBytes(16).toString('hex')}`;
  const session = new Session({
    patientId, doctorId,
    // The instant is authoritative; the model derives sessionDate/sessionTime/
    // localDate/localTime/endsAt from it.
    startsAt: requestedStartsAt, timezone: PLATFORM_TIMEZONE,
    sessionDate: new Date(sessionDate), sessionTime,
    sessionType: SESSION_TYPE_MAP[sessionType] || 'regular', duration: duration || 60,
    price: finalPrice, platformFee, doctorEarnings,
    paymentStatus: paymentState.paymentStatus,
    status: paymentState.status,
    paymentId: paymentState.paymentId,
    razorpayOrderId: paymentState.razorpayOrderId,
    meetingLink, sessionNotes: `Service Type: ${serviceType || 'General'}`,
    callMode: CALL_MODE_MAP[mode] || 'Video Calling'
  });
  const razorpayOrderId = paymentState.razorpayOrderId;

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
      const sessionDateFormatted = new Date(populated.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      
      if (populated.patientId && populated.patientId.email) {
        await emailService.sendBookingConfirmationEmail(populated.patientId.email, {
          date: sessionDateFormatted,
          time: populated.sessionTime,
          type: populated.sessionType || 'Regular'
        });
      }
      
      if (populated.doctorId && populated.doctorId.email) {
        await emailService.sendDoctorNewBookingEmail(populated.doctorId.email, {
          patientName: `${populated.patientId.firstName} ${populated.patientId.lastName}`,
          date: sessionDateFormatted,
          time: populated.sessionTime,
          type: populated.sessionType || 'Regular'
        });
      }
    }
  } catch (emailErr) { 
    logger.warn('Email send failed in bookSession', { error: emailErr.message, stack: emailErr.stack }); 
  }
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

  const sessions = await Session.find(req.authz.scope).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ sessionDate: -1, sessionTime: -1 }).skip(skip).limit(limit);
  const enrichedSessions = await attachDoctorProfiles(sessions);
  res.json(enrichedSessions);
});

/** GET /api/sessions/upcoming */
const getUpcoming = asyncHandler(async (req, res) => {
  const query = sealedFilter(req.authz.scope, { status: 'scheduled', sessionDate: { $gte: new Date() } });
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ sessionDate: 1, sessionTime: 1 }).limit(10);
  const enrichedSessions = await attachDoctorProfiles(sessions);
  res.json(enrichedSessions);
});

/** GET /api/sessions/doctors — All doctors with profiles (public) */
const getAllDoctors = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  // Only list therapists a patient can actually book.
  //
  // The filter used to be `find({})` plus "does this profile still have a
  // user", so the directory advertised:
  //   - doctors whose application was still pending, or had been REJECTED —
  //     approvalStatus was never referenced anywhere in this controller;
  //   - doctors with no approved way to be paid, whose bookings 409 at
  //     resolveBookingPaymentState;
  //   - doctors with no price set;
  //   - doctors whose published calendar ran out weeks ago, so the booking
  //     page offers no times at all.
  // All four were live: both doctors on the platform had expired calendars and
  // no usable payout route while being listed as bookable.
  const profiles = await DoctorProfile.find({
    payoutApproved: true,
    'pricing.min': { $gt: 0 },
    bookableUntil: { $gte: new Date() }
  }).select(PUBLIC_DOCTOR_FIELDS)
    .populate({
      path: 'userId',
      select: 'firstName lastName email isOnline profileCompleted approvalStatus',
      // The approval state lives on User, so it cannot join the query above.
      // A populate `match` filters it server-side and leaves userId null on a
      // miss, which the existing `!!p.userId` guard already drops.
      match: { approvalStatus: 'approved' }
    })
    .skip(skip).limit(limit);
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
  const profile = await DoctorProfile.findOne({ userId: doctorId }).select(PUBLIC_DOCTOR_FIELDS)
    .populate('userId', 'firstName lastName email');
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
  // authorize('session:read') loaded this and confirmed the caller is one of
  // the two parties. The three-way `?._id?.toString() || ?.toString()` dance
  // that used to live here existed only because each handler populated
  // differently; the policy's loader normalises that.
  const session = req.authz.resource;

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
  const session = req.authz.resource;
  if (session.sessionType !== 'immediate' && !session.canJoin()) return res.status(400).json({ success: false, message: 'Session cannot be joined at this time. Please wait until 15 minutes before the scheduled time.' });
  res.json({ success: true, message: 'Session can be joined', session, meetingLink: session.meetingLink });
});

/** POST /api/sessions/:sessionId/complete */
const completeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const session = req.authz.resource;

  // The transition table owns the rules now: 'completed' from 'completed' is
  // an accepted no-op, from 'cancelled' is rejected, and — the fix for a
  // verified bug — from 'scheduled' requires that the session has actually
  // started. A doctor could previously complete a booking a week in the
  // future, which permanently blocked the patient's refund because cancel
  // rejects completed sessions.
  const result = await applyTransition(session, {
    event: EVENT.COMPLETE,
    actor: req.actor.role === 'doctor' ? ACTOR.DOCTOR : ACTOR.PATIENT,
    extraSet: session.callStatus !== 'completed'
      ? { callStatus: 'completed', callEndTime: session.callEndTime || new Date() }
      : {}
  });

  if (!result.changed) {
    return res.json({ success: true, message: 'Session already marked as completed', session: { status: session.status } });
  }
  Object.assign(session, { status: result.session.status });

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

  logger.info('Session completed', { sessionId: sessionId.substring(0, 8), by: req.actor.role });
  res.json({ success: true, message: 'Session marked as completed', session: { status: session.status } });
});

/** POST /api/sessions/:sessionId/cancel */
const cancelSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.actor.id;
  const session = req.authz.resource;

  // Idempotency guard — completeSession has an equivalent check (line ~590)
  // but cancelSession never had one. Without it, a duplicate request (double
  // click before the button disables, a network retry, a replayed request)
  // recomputes hoursUntil/refundAmount from the CURRENT time on every call,
  // not from the outcome of the first call. Concretely: call 1 refunds ₹500
  // via Razorpay and sets paymentStatus='refunded'; if call 2 arrives after
  // the refund window has since crossed into the 0%-refund tier, its
  // `refundAmount === 0` branch fires and overwrites paymentStatus back to
  // 'paid' — even though the ₹500 refund already happened for real on
  // Razorpay's side. The DB now silently disagrees with reality, and every
  // downstream consumer of paymentStatus (payout calc, admin refund tooling,
  // doctor earnings) inherits the corrupted record. A cancelled session also
  // can't sensibly be cancelled again, and a completed one shouldn't be
  // cancellable either (completeSession and cancelSession could otherwise
  // race on the same session).
  //
  // This check is only the fast path for a SEQUENTIAL repeat. Two requests
  // in flight together both pass it; what stops them both refunding is the
  // compare-and-set in step 1 below.
  if (session.status === 'cancelled') {
    return res.json({
      success: true,
      message: 'Session already cancelled',
      refundAmount: session.refundAmount || 0,
      refundPolicy: describeRefundPolicy(session.refundAmount || 0, session.price)
    });
  }
  if (session.status === 'completed') {
    return res.status(400).json({ success: false, message: 'Cannot cancel a session that has already been completed' });
  }

  const sessionDT = resolveStartsAt(session);

  if (sessionDT.getTime() < Date.now()) {
    return res.status(400).json({ success: false, message: 'Cannot cancel a session that has already started' });
  }

  const cancellerRole = req.actor.role; // 'patient' or 'doctor'

  // ── REFUND POLICY ─────────────────────────────────────────────────────────
  // The refund TIER depends on this number, so the old server-local
  // reinterpretation was a money bug: a cancellation 25h out could be charged
  // the 4-24h 50% rate, or vice versa, depending on the server's offset.
  const hoursUntil = hoursUntilStart(session);
  const refundAmount = calculateRefund(session.price, hoursUntil, cancellerRole);
  const actor = cancellerRole === 'doctor' ? ACTOR.DOCTOR : ACTOR.PATIENT;

  // ── 1. CLAIM THE CANCELLATION ─────────────────────────────────────────────
  // A compare-and-set through the transition table, not a read-then-save.
  //
  // The guard above is a read, and two requests can both pass it: a patient
  // double-clicking Cancel was the realistic trigger. Both then saved
  // 'cancelled' and both called the gateway, refunding one payment twice
  // (reproduced in __tests__/e2e/concurrency.test.js at a 96% hit rate for
  // two concurrent requests). Now only the request whose write matches the
  // pre-state wins; the loser re-reads, finds the session already cancelled,
  // and gets the idempotent answer below without touching money.
  //
  // The table also decides what the money field does, which is what the old
  // if/else chain here was trying to encode by hand:
  //   pending  -> failed        checkout never completed; nothing to refund
  //   paid, not_required, ...   unchanged; the refund (if any) moves it
  const cancelled = await applyTransition(session, {
    event: EVENT.CANCEL,
    actor,
    payload: { cancelledBy: cancellerRole }
  });

  if (!cancelled.changed) {
    const current = cancelled.session;
    return res.json({
      success: true,
      message: 'Session already cancelled',
      refundAmount: current.refundAmount || 0,
      refundPolicy: describeRefundPolicy(current.refundAmount || 0, current.price)
    });
  }

  // ── 2. REFUND, if one is owed ─────────────────────────────────────────────
  // refundSession takes its own claim (paid -> refund_pending) before calling
  // the gateway, so even two callers that both reached this line could not
  // both refund. It also refuses synthetic payment ids and zero amounts, and
  // records refund_failed for the admin retry queue if Razorpay declines.
  let current = cancelled.session;
  if (refundAmount > 0 && current.paymentStatus === 'paid') {
    const refund = await refundSession(current, {
      actor,
      amount: refundAmount,
      reason: `Cancelled by ${cancellerRole}`
    });
    if (refund.session) current = refund.session;
    if (refund.failed) {
      logger.error('Refund failed on cancellation; left in refund_failed for the admin retry queue', {
        sessionId: sessionId.substring(0, 8)
      });
    }
  }

  // Track doctor cancellations
  if (cancellerRole === 'doctor') {
    await _incrementDoctorCancellationCount(session.doctorId, 'Failed to update doctor cancellation tracking');
  }

  // Release the slot
  try {
    const avail = await DoctorAvailability.findOne({ doctorId: session.doctorId });
    // localDate/localTime, not toISOString() — a 00:30 IST session has a UTC
    // date of the PREVIOUS day, so the old key could never match the booked
    // slot and the slot leaked permanently.
    if (avail) {
      const released = await avail.releaseSlot(session.localDate, session.localTime, session._id);
      if (!released) logger.warn('Slot release did not match any booked slot', {
        sessionId: session._id.toString().substring(0, 8),
        slot: slotKey(session.localDate, session.localTime)
      });
    }
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
    refundPolicy: describeRefundPolicy(refundAmount, session.price)
  });
});


/** GET /api/sessions/calendar/:year/:month */
const getCalendar = asyncHandler(async (req, res) => {
  const { year, month } = req.params;
  const userId = req.actor.id;
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(yearNum, monthNum, 1));
  const query = sealedFilter(req.authz.scope, { sessionDate: { $gte: startDate, $lt: endDate } });
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ sessionDate: 1, sessionTime: 1 });

  const enrichedSessions = await attachDoctorProfiles(sessions);
  res.json(enrichedSessions);
});

/** GET /api/sessions/patients/:patientId/emergency-contact */
const getPatientEmergencyContact = asyncHandler(async (req, res) => {
  // requireRole('doctor') on the route, plus a treating-relationship check:
  // a doctor may only see the emergency contact of a patient they treat.
  const { patientId } = req.params;
  const { hasTreatedRelationship } = require('../authz/relations');
  if (!(await hasTreatedRelationship(req.actor.id, patientId))) {
    throw new AuthorizationError('You can only view emergency contacts for your patients');
  }
  const patient = await User.findById(patientId).select('firstName lastName emergencyContact');
  if (!patient) throw new NotFoundError('Patient');
  res.json({ success: true, patientName: `${patient.firstName} ${patient.lastName}`, emergencyContact: patient.emergencyContact });
});

/** GET /api/sessions/my-therapists */
const getMyTherapists = asyncHandler(async (req, res) => {
  const patientId = req.actor.id;
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
  const { sessionId } = req.params;
  const userId = req.actor.id;
  const session = req.authz.resource;
  session.acceptanceStatus = 'accepted';
  // Answered, so it is no longer a pending request the sweep should expire.
  session.acceptanceDeadline = null;
  // Payment verification already set status to 'active' for immediate sessions —
  // don't downgrade it back to 'scheduled' once the doctor accepts.
  if (session.sessionType !== 'immediate') session.status = 'scheduled';
  await session.save();
  const updateData = { sessionId, acceptanceStatus: 'accepted', message: 'Doctor has accepted the request and is joining.' };
  _emitToUsers(req, 'session:status-update', updateData, [session.patientId._id.toString(), userId]);
  const io = req.app.get('io');
  if (io) io.to(sessionId).emit('session:status-update', updateData);
  res.json({ success: true, message: 'Session accepted successfully', session });
});

/** POST /api/sessions/:sessionId/delay — Doctor delays instant session */
const delaySession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { delayMinutes, doctorNote } = req.body;
  const userId = req.actor.id;
  const session = req.authz.resource;
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

/**
 * Core logic for auto-cancelling + refunding a session the doctor never accepted —
 * shared between the manual REST endpoint below and the scheduled sweep
 * (sweepStuckUnacceptedSessions) that catches paid instant sessions the patient
 * never followed up on (e.g. closed the tab before their own client-side timer fired),
 * which previously had no server-side resolution at all.
 */
async function _autoCancelUnacceptedSession(session, io) {
  session.status = 'cancelled';
  session.acceptanceStatus = 'pending';

  if (session.paymentStatus === 'paid' && session.paymentId && !session.paymentId.startsWith('mock_') && !session.paymentId.startsWith('immediate_')) {
    try {
      await getRazorpay().payments.refund(session.paymentId, {
        amount: session.price * 100,
        speed: 'normal',
        notes: { reason: 'Doctor missed session — auto refund' }
      });
      session.paymentStatus = 'refunded';
      session.refundAmount = session.price;
    } catch (err) {
      logger.error('Razorpay refund failed in auto-cancel', { error: err.message, paymentId: session.paymentId });
      session.paymentStatus = 'refund_failed';
    }
  } else {
    session.paymentStatus = 'refunded';
  }

  await session.save();

  // Track doctor no-shows the same way explicit doctor cancellations are tracked —
  // otherwise a doctor who repeatedly just never answers accrues no accountability at all.
  //
  // But only when the request actually reached them. This used to fire
  // unconditionally, so the commonest way to collect a strike was a dropped
  // socket: the ring was emitted into an empty room, the doctor never saw
  // anything, and three of those raised a warning on their account. A strike
  // has to mean "you were asked and did not answer".
  if (session.ringDeliveredAt) {
    await _incrementDoctorCancellationCount(session.doctorId, 'Failed to update doctor cancellation tracking on missed session');
  } else {
    logger.warn('Instant request expired without ever reaching the doctor — not counted against them', {
      sessionId: session._id.toString().substring(0, 8),
      doctorId: String(session.doctorId._id || session.doctorId).substring(0, 8)
    });
  }

  try {
    const populatedMissed = await Session.findById(session._id).populate('patientId', 'firstName lastName email');
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

  const updateData = { sessionId: session._id.toString(), status: 'cancelled', cancelledBy: 'system', message: 'Doctor is unavailable. Session cancelled and refunded.' };
  if (io) {
    new SocketEmitter(io).emitToUsers([session.patientId._id.toString(), session.doctorId._id.toString()], 'session:cancelled', updateData);
    io.to(session._id.toString()).emit('session:cancelled', updateData);
  }
}

/** POST /api/sessions/:sessionId/missed — Handle when doctor misses the ring or delay timeout */
const missedSession = asyncHandler(async (req, res) => {
  // Authorization is declared on the route as authorize('session:mark-missed')
  // and restricts this to the session's own patient. There was previously NO
  // check here at all, so any authenticated account could cancel and refund
  // any session in the system by id.
  //
  // `req.authz.resource` is the session the policy already loaded and
  // authorized, so this no longer refetches. The populate the notification
  // path needs is declared alongside the policy on the route.
  const session = req.authz.resource;

  if (session.acceptanceStatus === 'accepted') {
    return res.json({ success: false, message: 'Session already accepted' });
  }

  // Guard against re-running the cancel+refund path on a session that is
  // already resolved. Without it a replayed request re-enters the refund
  // logic on a terminal session.
  if (['cancelled', 'completed'].includes(session.status)) {
    return res.json({ success: false, message: `Session is already ${session.status}` });
  }

  await _autoCancelUnacceptedSession(session, req.app.get('io'));

  res.json({ success: true, message: 'Session marked as missed', session });
});

/**
 * Scheduled sweep (called from services/scheduler.js): a paid instant session the
 * doctor never accepted has no resolution path if the patient closes the app before
 * their own client-side 10-minute timer fires /missed — this catches those and
 * refunds/cancels them the same way, so nothing paid can get stuck forever.
 */
const sweepStuckUnacceptedSessions = async (io) => {
  const now = new Date();
  // Rows created before acceptanceDeadline existed still have to resolve, so
  // they keep the old createdAt rule. Remove this arm once no unaccepted
  // instant session predates the deploy.
  const legacyCutoff = new Date(now.getTime() - INSTANT_ACCEPT_WINDOW_MINUTES * 60 * 1000);

  const stuck = await Session.find({
    sessionType: 'immediate',
    acceptanceStatus: 'pending',
    paymentStatus: 'paid',
    status: { $nin: ['cancelled', 'completed'] },

    // NEVER cancel a call that is actually happening.
    //
    // acceptanceStatus is a parallel state machine that joining the room used
    // not to touch, so a doctor who opened the call link instead of clicking
    // Accept stayed 'pending' forever — and this sweep, whose status filter
    // does not exclude 'active', cancelled and refunded their session
    // mid-conversation. Joining now marks acceptance, and these two clauses
    // are the belt to that braces: a session with a live call or a doctor
    // already in it is not an unanswered request, whatever its flags say.
    callStatus: { $ne: 'in-progress' },
    doctorJoined: { $ne: true },

    $or: [
      { acceptanceDeadline: { $lte: now } },
      { acceptanceDeadline: null, createdAt: { $lte: legacyCutoff } }
    ]
  }).populate('patientId', 'firstName lastName').populate('doctorId', 'firstName lastName');

  for (const session of stuck) {
    try {
      await _autoCancelUnacceptedSession(session, io);
      logger.info('Auto-cancelled stuck unaccepted instant session', { sessionId: session._id.toString() });
    } catch (err) {
      logger.error('Failed to auto-cancel stuck session', { sessionId: session._id.toString(), error: err.message });
    }
  }
  return stuck.length;
};

/** GET /api/sessions/delayed — Get all active delayed sessions for a doctor */
const getDelayedSessions = asyncHandler(async (req, res) => {
  if (req.actor.role !== 'doctor') return res.json({ sessions: [] });
  const userId = req.actor.id;
  
  // Find sessions that are delayed and the delayedUntil time hasn't passed by more than 15 minutes
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60000);
  
  const sessions = await Session.find({
    doctorId: userId,
    acceptanceStatus: 'delayed',
    delayedUntil: { $gte: fifteenMinsAgo },
    status: { $nin: ['cancelled', 'completed'] },

    // A session the doctor has already been in is not a patient still
    // waiting for them. Only 'cancelled' and 'completed' were excluded, and a
    // call that ended without being formally completed matches neither — so
    // the "Patient Waiting" banner reappeared on every dashboard remount,
    // inviting the doctor to rejoin a conversation that had already happened.
    doctorJoined: { $ne: true },
    callStatus: { $ne: 'in-progress' }
  }).populate('patientId', 'firstName lastName profileImage');
  
  res.json({ success: true, sessions });
});
/**
 * GET /api/sessions/instant-requests — paid instant requests still waiting on
 * this doctor.
 *
 * WHY THIS EXISTS
 *
 * The incoming-request ring was a single socket event and nothing else: no
 * notification row, no replay on connect, no polling backstop anywhere in the
 * doctor's dashboard. If the doctor's browser was not attached to /data at
 * the exact millisecond the payment verified — page closed, mid-reload, a
 * network blip, a laptop waking up — the event went into an empty room and
 * was gone. The patient then sat in a call room nobody was coming to, and
 * the doctor collected a cancellation strike for a request they were never
 * shown.
 *
 * So the ring stops being a packet and becomes state the doctor can ask for.
 * The client calls this on mount and on every reconnect, which turns a
 * dropped event from a lost session into a few seconds' delay.
 *
 * Self-scoped by req.actor.id — there is no addressable other-doctor
 * resource here, so the role gate on the route is the whole policy.
 */
const getInstantRequests = asyncHandler(async (req, res) => {
  const doctorId = req.actor.id;
  const now = new Date();

  const sessions = await Session.find({
    doctorId,
    sessionType: 'immediate',
    paymentStatus: 'paid',
    acceptanceStatus: 'pending',
    status: { $nin: ['cancelled', 'completed'] },
    // Only requests still inside their window. An expired one belongs to the
    // sweep, not to a popup that would ask the doctor to answer a call the
    // patient has already been refunded for.
    acceptanceDeadline: { $gt: now }
  }).populate('patientId', 'firstName lastName profileImage');

  // Returning it IS delivery — the doctor's client is holding the request. If
  // they now ignore it, that is a real missed call and should count.
  if (sessions.length > 0) {
    await Session.updateMany(
      { _id: { $in: sessions.map((s) => s._id) }, ringDeliveredAt: null },
      { $set: { ringDeliveredAt: now } }
    );
    logger.info('Instant requests recovered via backfill', {
      doctorId: String(doctorId).substring(0, 8),
      count: sessions.length
    });
  }

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

module.exports = { getStats, getMyDoctors, getPendingFeedback, getCallHistory, getDoctorSlots, bookImmediate, bookSession, getMySessions, getUpcoming, getAllDoctors, getDoctorById, getSessionById, joinSession, completeSession, cancelSession, getCalendar, getPatientEmergencyContact, getMyTherapists, acceptSession, delaySession, getTurnCredentials, missedSession, getDelayedSessions, getInstantRequests, sweepStuckUnacceptedSessions };
