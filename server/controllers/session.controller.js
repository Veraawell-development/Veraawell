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
const { PUBLIC_DOCTOR_FIELDS } = require('../models/doctorProfile');
const Review = require('../models/review');
const PlatformSettings = require('../models/platformSettings');
const SocketEmitter = require('../utils/socketEmitter');

const { calculateSessionPrice, validateBookingParams, getOrCreateAvailability } = require('../services/session.service');
const { calculateRefund, describeRefundPolicy } = require('../services/refundPolicy');
const { resolveStartsAt, hoursUntilStart, deriveFields, displayWhen } = require('../services/sessionTime');
const { payableSessionMatch } = require('../services/earnings');
const { zonedToUtc } = require('../utils/zonedTime');
const {
  PLATFORM_TIMEZONE, INSTANT_ACCEPT_WINDOW_MINUTES, DELAY_GRACE_MINUTES, MAX_DELAY_MINUTES
} = require('../config/time');
const { asyncHandler } = require('../middleware/error.middleware');
const { applyTransition } = require('../services/sessionTransition');
const { EVENT, ACTOR } = require('../services/sessionState');
const { refundSession } = require('../services/sessionRefund');
const { releaseSessionSlot, openConversation } = require('../services/sessionPayment');
const { sealedFilter } = require('../authz');
const { idOf } = require('../authz/actor');
const { NotFoundError, AuthorizationError, ValidationError } = require('../utils/errors');
const sessionEnding = require('../services/sessionEnding');
const sessionOutcomes = require('../services/sessionOutcomes');
const sessionPolicy = require('../services/sessionPolicy');
const doctorCounters = require('../services/doctorCounters');
const bookability = require('../services/bookability');
const availabilityService = require('../services/availability');
const { JOIN_LEAD_MINUTES } = require('../config/time');
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
  //
  // "Not yet paid" means not in a PAID payout — not "not claimed". Counting
  // only unclaimed sessions made a week's earnings vanish from this figure the
  // moment the admin generated drafts, and reappear only as a paid payout a
  // week later. And the ledger never pays anything before PAYOUT_EPOCH, so
  // neither does this figure; it used to include sessions no payout run
  // would ever pick up.
  const { PAYOUT_EPOCH } = require('../services/payoutLedger');
  const Payout = require('../models/payout');
  const openPayoutIds = await Payout.find({ doctorId: userId, status: { $ne: 'paid' } }).distinct('_id');
  const pendingPayout = await Session.aggregate([
    {
      $match: {
        ...payableSessionMatch({ doctorId: userId }),
        endsAt: { $gte: PAYOUT_EPOCH },
        $or: [{ payoutId: null }, { payoutId: { $in: openPayoutIds } }]
      }
    },
    { $group: { _id: null, amount: { $sum: '$doctorEarnings' } } }
  ]);

  // The fee this doctor's NEXT booking will be charged at. The settings page
  // could only guess the platform default, while an admin can set a
  // per-doctor rate.
  const [platformSettings, ownProfile] = await Promise.all([
    PlatformSettings.getSettings(),
    DoctorProfile.findOne({ userId }).select('customFeePercentage').lean()
  ]);
  const platformFeePercent = (ownProfile && ownProfile.customFeePercentage != null)
    ? ownProfile.customFeePercentage
    : platformSettings.defaultPlatformFeePercentage;

  res.json({
    success: true,
    platformFeePercent,
    totalGross: r.totalGross,
    totalPlatformFee: r.totalPlatformFee,
    totalDoctorEarnings: r.totalDoctorEarnings,
    totalSessions: r.totalSessions,
    // One decimal: whole hours rounded a single 40-minute session up to "1".
    totalHours: Math.round(r.totalDurationMinutes / 6) / 10,
    totalDurationMinutes: r.totalDurationMinutes,
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
    .select(PUBLIC_DOCTOR_FIELDS).populate('userId', 'firstName lastName').lean();
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
    .populate('doctorId', 'firstName lastName').sort({ startsAt: -1, sessionDate: -1 }).lean();
  // One query for the reviews, not one per session (this runs on every
  // dashboard load).
  const reviewed = new Set((await Review.find({
    sessionId: { $in: completedSessions.map((s) => s._id) },
    patientId: new mongoose.Types.ObjectId(userId),
    reviewType: 'doctor'
  }).select('sessionId').lean()).map((r) => String(r.sessionId)));
  const session = completedSessions.find((s) => !reviewed.has(String(s._id)));
  if (session) return res.json({ session: { _id: session._id, sessionDate: session.sessionDate, sessionTime: session.sessionTime, status: session.status, doctorId: session.doctorId, sessionType: session.sessionType } });
  res.json({ session: null });
});

/** GET /api/sessions/call-history — Call history for the authenticated user */
const getCallHistory = asyncHandler(async (req, res) => {
  const userId = req.actor.id;
  const userRole = req.actor.role;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  // Booked sessions only — a checkout that was never paid isn't a call — and
  // in time order: sorting on the "hh:mm AM" text put 01:00 PM before 09:00 AM.
  const { RELATIONSHIP_PAYMENT_STATES } = require('../services/chat.service');
  const callHistory = await Session.find({ ...req.authz.scope, paymentStatus: { $in: RELATIONSHIP_PAYMENT_STATES }, $or: [{ status: { $in: ['completed', 'cancelled', 'no-show'] } }, { callStatus: { $in: ['in-progress', 'completed'] } }, { callStartTime: { $exists: true, $ne: null } }] })
    .populate('patientId', 'firstName lastName').populate('doctorId', 'firstName lastName').select('+rating').sort({ startsAt: -1, sessionDate: -1 }).skip(skip).limit(limit).lean();
  const formatted = callHistory.map(s => ({
    _id: s._id,
    // "Dr." once, even when the stored name already starts with it.
    name: userRole === 'patient' ? (s.doctorId ? `Dr. ${`${s.doctorId.firstName} ${s.doctorId.lastName || ''}`.trim().replace(/^dr\.?\s+/i, '')}` : 'Deleted account') : (s.patientId ? `${s.patientId.firstName} ${s.patientId.lastName}` : 'Deleted account'),
    // `mode` is the call mode. It used to read "Cancelled & Refunded" for
    // every cancellation, refunded or not; what became of the session is now
    // its outcome, labelled by the app (client/src/utils/outcomeLabels.ts).
    // Minutes actually spent in the call. A session nobody attended used to
    // show its full booked length ("20 mins") as if it had happened.
    date: s.sessionDate, startsAt: s.startsAt, duration: s.actualDuration || (s.status === 'completed' ? s.duration : 0), plannedDuration: s.duration, mode: s.callMode || 'Video Calling',
    paymentAmount: s.price, paymentStatus: s.paymentStatus, refundAmount: s.refundAmount || 0,
    sessionType: s.sessionType, status: s.status, callStatus: s.callStatus, rating: s.rating, rated: !!(s.rating && s.rating.score),
    outcome: s.outcome && s.outcome.code ? s.outcome.code : null,
    cancelledBy: s.cancelledBy || null, lateCancellation: !!s.lateCancellation
  }));
  res.json(formatted);
});

/** GET /api/sessions/doctors/:doctorId/slots/:date */
/**
 * A day's free slots that can still be booked — not taken, and not starting
 * within the next JOIN_LEAD_MINUTES — as { time, startsAt }, in time order
 * (a doctor's saved slots can be in any order, "01:00 PM" before "12:00 PM").
 * Shared by the slot list and the profile's "which days are open" strip,
 * which used to count today's already-passed slots as open.
 */
function _bookableSlotTimes(availability, date, now = new Date()) {
  const earliest = new Date(now.getTime() + JOIN_LEAD_MINUTES * 60 * 1000);
  const open = [];
  for (const slot of availability.getAvailableSlotsForDate(date).filter(s => !s.isBooked)) {
    let startsAt;
    try { startsAt = zonedToUtc(date, slot.time, PLATFORM_TIMEZONE); } catch (e) { continue; }
    if (startsAt < earliest) continue;
    open.push({ time: slot.time, startsAt });
  }
  return open.sort((a, b) => a.startsAt - b.startsAt);
}

const getDoctorSlots = asyncHandler(async (req, res) => {
  // Abandoned checkouts are expired by the scheduler every minute
  // (sessionPayment.expireStaleCheckouts). This used to run a second,
  // non-atomic copy of that cleanup on every public request — rewriting the
  // doctor's whole bookedSlots array from a stale read, which could erase a
  // booking made at the same moment.
  //
  // Only times that can still be booked: not taken, not starting within the
  // next JOIN_LEAD_MINUTES (a booking must be possible to remind and join),
  // and not overlapping anything the doctor is already doing — an instant
  // call can run into the next hour.
  const { doctorId, date } = req.params;
  // Read only: a public GET used to CREATE a calendar (with default slots)
  // for any id it was given, patients' ids included.
  const availability = await DoctorAvailability.findOne({ doctorId });
  if (!availability) return res.json({ availableSlots: [] });
  const open = _bookableSlotTimes(availability, date);
  let availableSlots = open.map((o) => o.time);
  if (open.length) {
    const spans = await availabilityService.busySpans(doctorId, open[0].startsAt,
      new Date(open[open.length - 1].startsAt.getTime() + 60 * 60 * 1000));
    availableSlots = open
      .filter((o) => !spans.some((b) => b.from < new Date(o.startsAt.getTime() + availabilityService.SHORTEST_SESSION_MINUTES * 60 * 1000) && b.to > o.startsAt))
      .map((o) => o.time);
  }
  res.json({ availableSlots });
});

/**
 * The doctor a patient is trying to book, or an error response to send.
 *
 * Both booking routes used to trust the id: bookSession only checked that a
 * profile existed, and bookImmediate accepted a 'test-doctor-id' sentinel
 * that booked a free session with yourself.
 */
/**
 * The doctor, if they can be booked (services/bookability.js): an approved
 * account with an approved way to be paid and a price. Refused here, up
 * front, with words a patient understands — not at the payment step. (For a
 * time slot, the slot itself being in the calendar is checked next; that is
 * the precise form of "has dates ahead".)
 */
async function _loadBookableDoctor(doctorId) {
  if (!doctorId || !mongoose.Types.ObjectId.isValid(String(doctorId))) {
    return { error: { status: 400, message: 'A valid therapist is required' } };
  }
  const doctor = await User.findOne({ _id: doctorId, ...bookability.BOOKABLE_USER_FILTER })
    .select('firstName lastName isOnline');
  const doctorProfile = doctor ? await DoctorProfile.findOne({ userId: doctorId }) : null;
  if (!doctor || !doctorProfile) {
    return { error: { status: 404, message: 'This therapist is not available for booking' } };
  }
  if (!bookability.bookabilityOf(doctorProfile).instant) {
    return { error: { status: 409, message: bookability.NOT_BOOKABLE_MESSAGE } };
  }
  return { doctor, doctorProfile };
}

/** The commission split, frozen onto the session when it is booked. */
async function _splitFor(doctorProfile, finalPrice) {
  const platformSettings = await PlatformSettings.getSettings();
  const feePercentage = doctorProfile.customFeePercentage ?? platformSettings.defaultPlatformFeePercentage;
  const platformFee = Math.round((finalPrice * feePercentage) / 100);
  return { platformFee, doctorEarnings: finalPrice - platformFee };
}

/** Confirmation for a booking that owes nothing (stub payments mode). Paid bookings are confirmed by sessionPayment. */
async function _notifyUnpaidBooking(req, session) {
  const populated = await Session.findById(session._id)
    .populate('patientId', 'firstName lastName email')
    .populate('doctorId', 'firstName lastName email');
  const patientId = String(populated.patientId._id);
  const doctorId = String(populated.doctorId._id);
  // Nothing was owed, so the booking is confirmed now: chat opens with it.
  await openConversation(patientId, doctorId, session._id);
  require('../services/liveUpdates').sessionBooked(req.app.get('io'), populated);
  await require('../services/sessionPayment').sendBookingEmails(populated);
  return populated;
}

/** POST /api/sessions/book-immediate — Book an immediate (now) session */
const bookImmediate = asyncHandler(async (req, res) => {
  const { doctorId, mode = 'video', duration } = req.body;
  const patientId = req.actor.id;

  const paramError = validateBookingParams({ mode, duration });
  if (paramError) return res.status(400).json({ success: false, message: paramError });

  const { doctor, doctorProfile, error } = await _loadBookableDoctor(doctorId);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  // An instant session is a promise that someone is there to answer it, and
  // free to: online by their own switch, actually connected (services/
  // presence.js — the switch alone stayed on after the laptop closed), and
  // not in or about to start another session.
  const free = await availabilityService.instantAvailability(doctor, Number(duration) || availabilityService.SHORTEST_SESSION_MINUTES);
  if (!free.ok) {
    return res.status(409).json({
      success: false,
      reason: free.reason,
      message: free.reason === 'busy'
        ? 'This therapist has a session right now or starting soon. Please book a time instead.'
        : 'This therapist has just gone offline. Please choose another therapist or book a time.'
    });
  }

  const finalPrice = await calculateSessionPrice(doctorId, mode, duration);
  if (!finalPrice) {
    return res.status(400).json({ success: false, message: 'This therapist does not offer that session type' });
  }
  const { platformFee, doctorEarnings } = await _splitFor(doctorProfile, finalPrice);

  const paymentState = await resolveBookingPaymentState({
    doctorProfile, finalPrice, receiptPrefix: 'rcpt_imm', immediate: true
  });
  if (!paymentState.ok) {
    return res.status(paymentState.httpStatus).json({ success: false, message: paymentState.message });
  }

  const now = new Date();
  const session = new Session({
    patientId,
    doctorId,
    startsAt: now,
    timezone: PLATFORM_TIMEZONE,
    sessionDate: now,
    // Placeholder for a required legacy field; the model derives the real
    // value from startsAt.
    sessionTime: '12:00 AM',
    sessionType: 'immediate',
    duration: Number(duration),
    price: finalPrice,
    platformFee,
    doctorEarnings,
    paymentStatus: paymentState.paymentStatus,
    status: paymentState.status,
    paymentId: paymentState.paymentId,
    razorpayOrderId: paymentState.razorpayOrderId,
    // A booking that owes nothing is live now, so its window starts now. A
    // paid one gets its deadline when the payment lands.
    acceptanceDeadline: paymentState.razorpayOrderId
      ? null
      : new Date(now.getTime() + INSTANT_ACCEPT_WINDOW_MINUTES * 60 * 1000),
    callMode: CALL_MODE_MAP[mode] || 'Video Calling'
  });
  session.meetingLink = `/video-call/${session._id}`;
  await session.save();


  const populated = paymentState.razorpayOrderId
    ? await Session.findById(session._id).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email')
    : await _notifyUnpaidBooking(req, session);

  logger.info('Immediate session order created', { sessionId: session._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, message: 'Immediate session order created.', session: populated });
});

/** The patient's chosen service as a session note, or '' when they didn't choose one. */
function _serviceNote(serviceType) {
  if (typeof serviceType !== 'string') return '';
  const service = serviceType.trim().slice(0, 80);
  return service && service.toLowerCase() !== 'general' ? `Service Type: ${service}` : '';
}

/** POST /api/sessions/book — Book a scheduled session */
const bookSession = asyncHandler(async (req, res) => {
  const { doctorId, sessionDate, sessionTime, sessionType, mode = 'video', duration, serviceType } = req.body;
  const patientId = req.actor.id;

  if (!doctorId || !sessionDate || !sessionTime) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  const paramError = validateBookingParams({ mode, duration });
  if (paramError) return res.status(400).json({ success: false, message: paramError });

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
  // The same notice the slot list applies: a session has to be joinable and
  // remindable, so nothing starting within JOIN_LEAD_MINUTES.
  if (requestedStartsAt < new Date(Date.now() + JOIN_LEAD_MINUTES * 60 * 1000)) {
    return res.status(400).json({ success: false, message: 'That time is too soon to book — please pick a later slot.' });
  }

  const { doctorProfile, error } = await _loadBookableDoctor(doctorId);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  // An instant call running into this time (slots only stop slots from
  // overlapping each other).
  if (await availabilityService.isBusy(doctorId, requestedStartsAt, Number(duration) || 60)) {
    return res.status(400).json({ success: false, message: 'This time slot is no longer available' });
  }

  // The price is the server's, never the client's. The client used to send
  // one, and calculateSessionPrice fell back to it.
  const finalPrice = await calculateSessionPrice(doctorId, mode, duration);
  if (!finalPrice) {
    return res.status(400).json({ success: false, message: 'This therapist does not offer that session type' });
  }

  const availability = await getOrCreateAvailability(doctorId);
  if (!availability.isSlotAvailable(sessionDate, sessionTime)) {
    return res.status(400).json({ success: false, message: "This time slot is not available in doctor's calendar" });
  }

  const { platformFee, doctorEarnings } = await _splitFor(doctorProfile, finalPrice);

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

  // A scheduled booking is never an instant request, whatever the client
  // calls it: the instant-request sweeps and accept flow key on this field.
  const mappedType = SESSION_TYPE_MAP[sessionType];
  const meetingLink = `/video-call/${crypto.randomBytes(16).toString('hex')}`;
  const session = new Session({
    patientId, doctorId,
    // The instant is authoritative; the model derives sessionDate/sessionTime/
    // localDate/localTime/endsAt from it.
    startsAt: requestedStartsAt, timezone: PLATFORM_TIMEZONE,
    sessionDate: new Date(sessionDate), sessionTime,
    sessionType: !mappedType || mappedType === 'immediate' ? 'regular' : mappedType,
    duration: Number(duration),
    price: finalPrice, platformFee, doctorEarnings,
    paymentStatus: paymentState.paymentStatus,
    status: paymentState.status,
    paymentId: paymentState.paymentId,
    razorpayOrderId: paymentState.razorpayOrderId,
    // What the patient came for, when they picked a service (Services page →
    // directory → here). "General" was written for everyone, which told the
    // therapist nothing and looked like a choice the patient had made.
    meetingLink, sessionNotes: _serviceNote(serviceType),
    callMode: CALL_MODE_MAP[mode] || 'Video Calling'
  });

  // The atomic step: the slot is only ours if this compare-and-set wins.
  const booked = await availability.bookSlot(sessionDate, sessionTime, session._id);
  if (!booked) return res.status(400).json({ success: false, message: 'This time slot is no longer available' });

  try {
    await session.save();
  } catch (err) {
    // Without this the slot stayed reserved for a session that does not exist.
    await availability.releaseSlot(sessionDate, sessionTime, session._id);
    throw err;
  }


  const populated = paymentState.razorpayOrderId
    ? await Session.findById(session._id).populate('patientId', 'firstName lastName email phoneNumber').populate('doctorId', 'firstName lastName email')
    : await _notifyUnpaidBooking(req, session);

  logger.info('Session order created', { sessionId: session._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, message: 'Session order created', session: populated });
});

/**
 * Doctor photos, plus what each session's screen needs of the session rules
 * (join window, the real end, refund availability — sessionPolicy.view) as
 * seen by the caller, so the app never works these out on its own clock.
 */
const attachDoctorProfiles = async (sessions, role = null) => {
  const now = new Date();
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
      // No photo: the screens show the therapist's initials. A stock photo
      // picked by guessing gender from the first name was a stranger's face.
      s.doctorId.profileImage = null;
    }
    if (role) s.rules = sessionPolicy.view(s, role, now);
    return s;
  });
};

/** GET /api/sessions/my-sessions */
const getMySessions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const sessions = await Session.find(req.authz.scope).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ startsAt: -1, sessionDate: -1 }).skip(skip).limit(limit);
  const enrichedSessions = await attachDoctorProfiles(sessions, req.actor.role);
  // For the patient: whether each completed session already has their rating
  // of the therapist, so "Rate Session" isn't offered twice (submitting again
  // was refused as a duplicate). One query for the page.
  if (req.actor.role === 'patient') {
    const completed = enrichedSessions.filter((s) => s.status === 'completed').map((s) => s._id);
    const rated = completed.length
      ? new Set((await Review.find({ sessionId: { $in: completed }, patientId: new mongoose.Types.ObjectId(req.actor.id), reviewType: 'doctor' }).select('sessionId').lean()).map((r) => String(r.sessionId)))
      : new Set();
    for (const s of enrichedSessions) if (s.status === 'completed') s.rated = rated.has(String(s._id));
  }
  res.json(enrichedSessions);
});

/** GET /api/sessions/upcoming */
const getUpcoming = asyncHandler(async (req, res) => {
  // On the instant, not on sessionDate: sessionDate is the local day at UTC
  // midnight, so `sessionDate >= now` dropped every one of today's sessions
  // from the list as soon as the day began.
  const query = sealedFilter(req.authz.scope, { status: { $in: ['scheduled', 'active'] }, endsAt: { $gte: new Date() } });
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ startsAt: 1 }).limit(10);
  const enrichedSessions = await attachDoctorProfiles(sessions, req.actor.role);
  res.json(enrichedSessions);
});

/**
 * The therapist's own photo, or '' — the app then shows their initials. A
 * missing photo used to be replaced with a stock face picked by guessing
 * gender from the first name (getGenderBasedImage): a stranger's photo under
 * a therapist's name, sometimes the wrong gender.
 */
function _realPhoto(url) {
  if (!url || !String(url).trim() || String(url).includes('doctor-0') || url === '/doctor-placeholder.svg' || url === '/default-doctor.png') return '';
  return url;
}

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
  const profiles = await DoctorProfile.find(bookability.bookableProfileFilter({ scheduled: true })).select(PUBLIC_DOCTOR_FIELDS)
    .populate({
      path: 'userId',
      // No email: this is a public, unauthenticated listing, and the
      // PUBLIC_DOCTOR_FIELDS allowlist above only covers the profile, not
      // the populated user.
      select: 'firstName lastName isOnline profileCompleted approvalStatus',
      // The approval state lives on User, so it cannot join the query above.
      // A populate `match` filters it server-side and leaves userId null on a
      // miss, which the existing `!!p.userId` guard already drops.
      // A suspended doctor cannot use the account they would be booked on.
      match: { approvalStatus: 'approved', status: 'active' }
    })
    .skip(skip).limit(limit);
  const valid = profiles.filter(p => !!p.userId);
  const doctorIds = valid.map(p => p.userId?._id).filter(Boolean);
  // Only the reviews each profile actually shows — flagged ones were being
  // averaged in. Same filter as Review.publicDoctorReviewStages, for a set of
  // doctors at once.
  const ratingAgg = await Review.aggregate([
    { $match: { doctorId: { $in: doctorIds.map(id => new mongoose.Types.ObjectId(id)) }, ...Review.publicFilter('doctor') } },
    { $lookup: { from: Session.collection.name, localField: 'sessionId', foreignField: '_id', as: '_session' } },
    { $match: { '_session.status': 'completed' } },
    { $group: { _id: '$doctorId', average: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
  ]);
  const ratingMap = {};
  ratingAgg.forEach(r => { ratingMap[r._id.toString()] = { average: Math.round(r.average * 10) / 10, totalReviews: r.totalReviews }; });
  const result = valid.map(profile => {
    const obj = profile.toObject();
    obj.profileImage = _realPhoto(obj.profileImage);
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
  // Public and unauthenticated, so held to the directory's bar: an applicant
  // who was never approved — or was rejected — is not a therapist this site
  // presents, and their email is nobody's business.
  const doctor = await User.findOne({ _id: doctorId, ...bookability.BOOKABLE_USER_FILTER }).select('firstName lastName');
  if (!doctor) throw new NotFoundError('Doctor');
  const profile = await DoctorProfile.findOne({ userId: doctorId }).select(`${PUBLIC_DOCTOR_FIELDS} payoutApproved bookableUntil`)
    .populate('userId', 'firstName lastName');
  if (!profile) throw new NotFoundError('Doctor');
  const ratingStats = await Review.aggregate([
    ...Review.publicDoctorReviewStages(doctorId),
    { $group: { _id: null, average: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
  ]);
  const liveRating = ratingStats.length > 0 ? { average: Math.round(ratingStats[0].average * 10) / 10, totalReviews: ratingStats[0].totalReviews } : { average: 0, totalReviews: 0 };
  const obj = profile.toObject();
  obj.profileImage = _realPhoto(obj.profileImage);
  obj.rating = liveRating;
  // Whether this page can sell a session at all — so it can say so, instead
  // of letting the patient through to a checkout that then fails. The two
  // inputs themselves stay private.
  const can = bookability.bookabilityOf(obj);
  obj.bookable = can.scheduled;
  obj.instantBookable = can.instant;
  delete obj.payoutApproved;
  delete obj.bookableUntil;
  // Which of the next 14 days (IST) have a free slot, so the booking page can
  // show the rest as off. Every day looked bookable and only said "No
  // available slots" once tapped.
  obj.openDates = [];
  const availability = await DoctorAvailability.findOne({ doctorId });
  if (availability) {
    const { utcToZoned } = require('../utils/zonedTime');
    for (let i = 0; i < 14; i += 1) {
      const day = utcToZoned(new Date(Date.now() + i * 24 * 60 * 60 * 1000), PLATFORM_TIMEZONE).localDate;
      // The same test as the slot list, so "today" isn't shown open on the
      // strength of this morning's slots and then lists nothing.
      if (_bookableSlotTimes(availability, day).length > 0) obj.openDates.push(day);
    }
  }
  res.json(obj);
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

  // The session rules as this caller's screen needs them — the call screen
  // refetches this whenever someone joins or leaves (session:attendance).
  session.rules = sessionPolicy.view(session, req.actor.id === idOf(session.doctorId) ? 'doctor' : 'patient', new Date());
  res.json(session);
});

/** GET /api/sessions/join/:sessionId */
const joinSession = asyncHandler(async (req, res) => {
  const session = req.authz.resource;
  if (session.sessionType !== 'immediate' && !session.canJoin()) return res.status(400).json({ success: false, message: 'Session cannot be joined at this time. Please wait until 15 minutes before the scheduled time.' });
  res.json({ success: true, message: 'Session can be joined', session, meetingLink: session.meetingLink });
});

/**
 * POST /api/sessions/:sessionId/complete — completes nothing any more.
 *
 * Leaving a call never ends a session (docs/SESSION_RULES.md, D8): it ends
 * when its time is up, when both people agree (POST /end-request and
 * /end-response), or at the end-of-session sweep. This endpoint used to let
 * either party complete it alone, and the patient's app called it whenever
 * the other side hung up — a minute in, the session was completed, the
 * doctor paid and the patient's session gone.
 *
 * Kept, answering as before, for apps still open from before the change:
 * they call it after leaving and must neither fail nor complete anything.
 */
const completeSession = asyncHandler(async (req, res) => {
  const session = req.authz.resource;
  logger.info('complete requested — treated as leaving', {
    sessionId: String(session._id).substring(0, 8),
    by: req.actor.role
  });
  res.json({
    success: true,
    message: session.status === 'completed' ? 'Session already marked as completed' : 'You have left the session.',
    session: { status: session.status }
  });
});

/** Which side of the session the caller is on; the policy already made them a party. */
const _roleIn = (req, session) => (req.actor.id === idOf(session.doctorId) ? 'doctor' : 'patient');

/** POST /api/sessions/:sessionId/end-request — ask the other person to end now. */
const requestEndSession = asyncHandler(async (req, res) => {
  const session = req.authz.resource;
  const result = await sessionEnding.requestEnd(session._id, _roleIn(req, session), { io: req.app.get('io') });
  res.json({
    success: true,
    ended: result.ended,
    expiresAt: result.expiresAt || null,
    message: result.ended ? 'Session ended.' : 'Asked the other person to end the session.'
  });
});

/** POST /api/sessions/:sessionId/end-response { agree } — answer that request. */
const respondEndSession = asyncHandler(async (req, res) => {
  const { agree } = req.body || {};
  if (typeof agree !== 'boolean') throw new ValidationError('agree must be true or false');
  const session = req.authz.resource;
  const result = await sessionEnding.respondToEnd(session._id, _roleIn(req, session), agree, { io: req.app.get('io') });
  res.json({
    success: true,
    ended: result.ended,
    message: result.ended ? 'Session ended.' : 'The session continues.'
  });
});

/**
 * POST /api/sessions/:sessionId/claim-absent-refund — "Leave & full refund".
 * The patient was left waiting for a therapist who didn't come, or came and
 * left (docs/SESSION_RULES.md, D3). sessionOutcomes owns the rule and says
 * why, in words for the patient, when it doesn't apply yet.
 */
const claimAbsentRefund = asyncHandler(async (req, res) => {
  const result = await sessionOutcomes.claimAbsentRefund(req.authz.resource, { io: req.app.get('io') });
  res.json({
    success: true,
    refundAmount: result.refundAmount,
    paymentStatus: result.paymentStatus,
    message: result.alreadyDone
      ? 'Your refund is already on its way.'
      : `Your full refund of ₹${result.refundAmount} is on its way (usually 5–7 working days).`
  });
});

/**
 * POST /api/sessions/:sessionId/abandon-checkout — the patient closed the
 * payment window.
 *
 * The slot used to stay held for the full CHECKOUT_TTL_MINUTES (20), so
 * nobody else could book it while the patient who walked away was long gone.
 * expireCheckout asks Razorpay first: a payment that was in fact captured is
 * confirmed instead (the booking stands), and one still authorising is left
 * for the minute sweep. A payment that lands after the release is refunded
 * automatically (LATE_CAPTURE).
 */
const abandonCheckout = asyncHandler(async (req, res) => {
  const session = req.authz.resource;
  if (session.status !== 'payment_pending') {
    return res.json({ success: true, outcome: 'not-pending', status: session.status });
  }
  const { expireCheckout } = require('../services/sessionPayment');
  const result = await expireCheckout(session, { io: req.app.get('io') });
  res.json({ success: true, outcome: result.outcome });
});

/** For a repeat cancel: where the money of an already-cancelled session is. */
function _cancelledRefundState(session) {
  switch (session.paymentStatus) {
    case 'refunded': case 'refund_pending': return 'issued';
    case 'refund_failed': return 'failed';
    case 'paid': return 'none';
    default: return 'unpaid';
  }
}

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
      refundState: _cancelledRefundState(session),
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
  // A doctor may say why; the patient is told. Plain text, kept short.
  const reason = cancellerRole === 'doctor' && typeof (req.body && req.body.reason) === 'string'
    ? req.body.reason.trim().slice(0, 300) || null
    : null;

  // ── REFUND POLICY ─────────────────────────────────────────────────────────
  // The refund TIER depends on this number, so the old server-local
  // reinterpretation was a money bug: a cancellation 25h out could be charged
  // the 4-24h 50% rate, or vice versa, depending on the server's offset.
  const hoursUntil = hoursUntilStart(session);
  const refundAmount = calculateRefund(session.price, hoursUntil, cancellerRole);
  const actor = cancellerRole === 'doctor' ? ACTOR.DOCTOR : ACTOR.PATIENT;

  // A patient cancelling a paid session inside the 4-hour window gets no
  // refund, because the therapist's time was reserved — so the therapist is
  // paid their share of it (docs/SESSION_RULES.md, D5). `lateCancellation`
  // is what makes it payable (services/earnings.js).
  const now = new Date();
  const lateCancellation = cancellerRole === 'patient' && refundAmount === 0 && session.paymentStatus === 'paid';
  const outcomeCode = session.status === 'payment_pending'
    ? sessionPolicy.OUTCOME.CHECKOUT_ABANDONED
    : lateCancellation
      ? sessionPolicy.OUTCOME.LATE_CANCELLATION
      : cancellerRole === 'doctor' ? sessionPolicy.OUTCOME.CANCELLED_BY_DOCTOR : sessionPolicy.OUTCOME.CANCELLED_BY_PATIENT;

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
    now,
    payload: { cancelledBy: cancellerRole },
    extraSet: {
      outcome: { code: outcomeCode, decidedAt: now, by: cancellerRole, note: null },
      ...(lateCancellation ? { lateCancellation: true } : {}),
      ...(reason ? { cancellationReason: reason } : {})
    }
  });

  if (!cancelled.changed) {
    const current = cancelled.session;
    return res.json({
      success: true,
      message: 'Session already cancelled',
      refundAmount: current.refundAmount || 0,
      refundState: _cancelledRefundState(current),
      refundPolicy: describeRefundPolicy(current.refundAmount || 0, current.price)
    });
  }

  // ── 2. REFUND, if one is owed ─────────────────────────────────────────────
  // refundSession takes its own claim (paid -> refund_pending) before calling
  // the gateway, so even two callers that both reached this line could not
  // both refund. It also refuses synthetic payment ids and zero amounts, and
  // records refund_failed for the admin retry queue if Razorpay declines.
  let current = cancelled.session;
  // What actually happened to the money, for the screens and the emails:
  // 'unpaid' (nothing was taken), 'none' (policy: no refund), 'issued', or
  // 'failed' (owed, but the gateway refused — in the admin retry queue).
  let refundState = current.paymentStatus === 'paid' ? (refundAmount > 0 ? 'issued' : 'none') : 'unpaid';
  if (refundAmount > 0 && current.paymentStatus === 'paid') {
    const refund = await refundSession(current, {
      actor,
      amount: refundAmount,
      reason: `Cancelled by ${cancellerRole}`
    });
    if (refund.session) current = refund.session;
    if (refund.skipped) refundState = 'unpaid';
    if (refund.failed) {
      refundState = 'failed';
      logger.error('Refund failed on cancellation; left in refund_failed for the admin retry queue', {
        sessionId: sessionId.substring(0, 8)
      });
    }
  }

  // Counted against the doctor (shown to admins only).
  if (cancellerRole === 'doctor') {
    await doctorCounters.increment(session.doctorId, 'cancel', { now });
  }

  // Release the slot. By the session's own localDate/localTime and id, so a
  // late cancellation can never free somebody else's rebooking of it.
  await releaseSessionSlot(current);

  // Both people's screens (and the call screen, if open).
  const refunded = refundState === 'issued' || refundState === 'failed' ? refundAmount : 0;
  require('../services/liveUpdates').sessionCancelled(req.app.get('io'), session, { byRole: cancellerRole, refundAmount: refunded });

  // Cancellation emails. Not for a checkout that was never paid: nothing was
  // booked, and the doctor never heard of it.
  if (outcomeCode !== sessionPolicy.OUTCOME.CHECKOUT_ABANDONED) try {
    const populatedSession = await Session.findById(session._id)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');
    const { date, time } = displayWhen(populatedSession);
    const doctorName = `Dr. ${populatedSession.doctorId.firstName} ${populatedSession.doctorId.lastName}`;
    const patientName = `${populatedSession.patientId.firstName} ${populatedSession.patientId.lastName}`;
    const cancellerLabel = cancellerRole === 'doctor' ? doctorName : patientName;
    const moneyLine = refundState === 'issued' ? ' A full refund is on its way.'
      : refundState === 'failed' ? ' Your refund is being processed — it is taking longer than usual, and our team has been alerted.'
        : '';

    if (populatedSession.patientId?.email) {
      await emailService.sendCancellationEmail(populatedSession.patientId.email, {
        recipientName: populatedSession.patientId.firstName,
        date,
        time,
        cancelledBy: cancellerLabel,
        refundAmount,
        refundState,
        message: cancellerRole === 'doctor'
          ? `We're sorry — your therapist cancelled this session${reason ? `: "${reason}"` : '.'}${moneyLine}`
          : lateCancellation
            ? 'Your session has been cancelled. Cancellations within 4 hours of the start are not refunded, because your therapist\'s time was reserved for you — they are still paid for it.'
            : `Your session has been cancelled.${moneyLine}`
      });
    }
    if (populatedSession.doctorId?.email) {
      await emailService.sendCancellationEmail(populatedSession.doctorId.email, {
        recipientName: doctorName,
        date,
        time,
        cancelledBy: cancellerLabel,
        refundState: 'hide',
        message: cancellerRole === 'patient'
          ? (lateCancellation
            ? `${patientName} cancelled within 4 hours of the start, so you'll still be paid your share${session.doctorEarnings ? ` (${require('../utils/money').inr(session.doctorEarnings)})` : ''} in your weekly payout.`
            : `${patientName} has cancelled this session.`)
          : `You have cancelled your session with ${patientName}. They have been refunded in full.`
      });
    }
  } catch (emailErr) { logger.warn('Cancellation email failed', { error: emailErr.message }); }

  logger.info('Session cancelled', { sessionId: sessionId.substring(0, 8) });

  res.json({
    success: true,
    message: 'Session cancelled successfully',
    refundAmount,
    // What happened to the money ('issued' | 'failed' | 'none' | 'unpaid'),
    // so the screen can say "Full refund of ₹X" or "Nothing was charged"
    // rather than "a refund if applicable".
    refundState,
    lateCancellation,
    refundPolicy: describeRefundPolicy(refundAmount, session.price)
  });
});


/** GET /api/sessions/calendar/:year/:month */
const getCalendar = asyncHandler(async (req, res) => {
  const { year, month } = req.params;
  const userId = req.actor.id;
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  // A bad year/month used to reach Mongo as an Invalid Date and come back a 500.
  if (!Number.isInteger(yearNum) || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12 || yearNum < 2000 || yearNum > 2100) {
    return res.status(400).json({ success: false, message: 'Year and month must be a real month' });
  }
  const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(yearNum, monthNum, 1));
  // Booked sessions only (an open or abandoned checkout isn't a session), in
  // time order — sorting on the "hh:mm AM" text put 01:00 PM before 09:00 AM.
  const { RELATIONSHIP_PAYMENT_STATES } = require('../services/chat.service');
  const query = sealedFilter(req.authz.scope, { sessionDate: { $gte: startDate, $lt: endDate }, paymentStatus: { $in: RELATIONSHIP_PAYMENT_STATES } });
  const sessions = await Session.find(query).populate('patientId', 'firstName lastName email').populate('doctorId', 'firstName lastName email').sort({ startsAt: 1, sessionDate: 1 });

  const enrichedSessions = await attachDoctorProfiles(sessions, req.actor.role);
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

const MINUTE_MS = 60 * 1000;
const STILL_WAITING = { status: 'active', acceptanceStatus: { $in: ['pending', 'delayed'] }, doctorJoined: { $ne: true } };

/** POST /api/sessions/:sessionId/accept — Doctor accepts instant session */
const acceptSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.actor.id;
  const session = req.authz.resource;

  if (session.sessionType !== 'immediate') {
    return res.status(400).json({ success: false, message: 'Only instant requests need to be accepted' });
  }
  if (session.acceptanceStatus === 'accepted') {
    return res.json({ success: true, message: 'Session already accepted', session });
  }

  // A compare-and-set on "still waiting". This was a read-modify-save with no
  // state check at all, and for a regular session it wrote status
  // 'scheduled' — so an accept that raced the expiry sweep revived a session
  // that had just been cancelled and refunded.
  //
  // The session's clock restarts here: its minutes belong to the call, not to
  // the time the patient spent waiting for an answer.
  const now = new Date();
  const accepted = await Session.findOneAndUpdate(
    { _id: session._id, ...STILL_WAITING },
    {
      $set: {
        acceptanceStatus: 'accepted',
        acceptanceDeadline: null,
        ringDeliveredAt: session.ringDeliveredAt || now,
        ...deriveFields(now, session.duration || 20, session.timezone || PLATFORM_TIMEZONE)
      }
    },
    { new: true }
  ).populate('patientId', 'firstName lastName').populate('doctorId', 'firstName lastName');

  if (!accepted) {
    const current = await Session.findById(session._id).select('acceptanceStatus status');
    if (current && current.acceptanceStatus === 'accepted') {
      return res.json({ success: true, message: 'Session already accepted', session: current });
    }
    return res.status(409).json({ success: false, message: 'This request is no longer waiting — it was withdrawn or has expired.' });
  }

  const updateData = { sessionId, acceptanceStatus: 'accepted', message: 'Doctor has accepted the request and is joining.' };
  _emitToUsers(req, 'session:status-update', updateData, [accepted.patientId._id.toString(), userId]);
  require('../services/liveUpdates').doctorAvailability(req.app.get('io'), userId);
  const io = req.app.get('io');
  if (io) io.to(sessionId).emit('session:status-update', updateData);
  // A patient already waiting in the call: its clock starts now.
  try {
    const { resolveEndsAt } = require('../services/sessionTime');
    require('../services/call/callService').setTiming(sessionId, { endsAt: accepted.effectiveEndsAt || resolveEndsAt(accepted), pendingAccept: false });
  } catch (e) { logger.warn('Could not update the call clock after accept', { error: e.message }); }
  res.json({ success: true, message: 'Session accepted successfully', session: accepted });
});

/** POST /api/sessions/:sessionId/delay — Doctor delays instant session */
const delaySession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { delayMinutes, doctorNote } = req.body;
  const userId = req.actor.id;
  const session = req.authz.resource;

  if (session.sessionType !== 'immediate') {
    return res.status(400).json({ success: false, message: 'Only instant requests can be delayed' });
  }
  const minutes = Math.min(MAX_DELAY_MINUTES, Math.max(1, parseInt(delayMinutes, 10) || 5));
  const now = new Date();
  const delayedUntil = new Date(now.getTime() + minutes * MINUTE_MS);

  // The deadline moves with the delay. A delayed request used to have no
  // server-side expiry at all — the sweep only matched 'pending' — so one the
  // doctor never came back to stayed open, paid and unrefunded, forever.
  const delayed = await Session.findOneAndUpdate(
    { _id: session._id, ...STILL_WAITING },
    {
      $set: {
        acceptanceStatus: 'delayed',
        delayMinutes: minutes,
        delayedUntil,
        acceptanceDeadline: new Date(delayedUntil.getTime() + DELAY_GRACE_MINUTES * MINUTE_MS),
        doctorNote: String(doctorNote || '').substring(0, 500),
        // Answering with a delay is proof the ring arrived.
        ringDeliveredAt: session.ringDeliveredAt || now
      }
    },
    { new: true }
  ).populate('patientId', 'firstName lastName');

  if (!delayed) {
    return res.status(409).json({ success: false, message: 'This request is no longer waiting — it was withdrawn or has expired.' });
  }

  const updateData = { sessionId, acceptanceStatus: 'delayed', delayMinutes: minutes, delayedUntil, acceptanceDeadline: delayed.acceptanceDeadline, doctorNote: delayed.doctorNote, message: `Doctor will join in ${minutes} minutes.` };
  _emitToUsers(req, 'session:status-update', updateData, [delayed.patientId._id.toString(), userId]);
  const io = req.app.get('io');
  if (io) io.to(sessionId).emit('session:status-update', updateData);
  res.json({ success: true, message: 'Session delayed successfully', session: delayed });
});

/**
 * Cancel an instant request nobody answered, and refund it.
 *
 * Shared by the patient withdrawing (POST /missed) and the sweep expiring it.
 * This used to write `status: 'cancelled', paymentStatus: 'refunded'` with a
 * raw save(): no refundId (an I7 violation), no claim (so /missed and the
 * sweep could both call Razorpay for one payment, the loser then overwriting
 * the winner's 'refunded' with 'refund_failed'), no clawback hook — and it
 * marked UNPAID sessions 'refunded' too. It now cancels through the
 * transition table and refunds through sessionRefund, like every other path.
 *
 * @param {'system'|'patient'} by
 * @returns {Promise<{cancelled:boolean, reason?:string, refunded?:boolean, session?:object}>}
 */
async function _autoCancelUnacceptedSession(session, io, { by = 'system', now = new Date() } = {}) {
  const sessionId = session._id;
  const short = sessionId.toString().substring(0, 8);

  let result;
  try {
    result = await applyTransition(session, {
      event: by === 'patient' ? EVENT.CANCEL : EVENT.ACCEPT_TIMEOUT,
      actor: by === 'patient' ? ACTOR.PATIENT : ACTOR.SYSTEM,
      payload: { cancelledBy: by },
      // The doctor may accept or walk in between the read and this write.
      // Both are preconditions, so that race resolves in the doctor's favour.
      extraFilter: { acceptanceStatus: { $ne: 'accepted' }, doctorJoined: { $ne: true } },
      extraSet: {
        acceptanceDeadline: null,
        outcome: {
          code: by === 'patient' ? sessionPolicy.OUTCOME.CANCELLED_BY_PATIENT : sessionPolicy.OUTCOME.INSTANT_UNANSWERED,
          decidedAt: now,
          by,
          note: null
        }
      },
      now
    });
  } catch (err) {
    if (err.code === 'CONCURRENT_MODIFICATION') return { cancelled: false, reason: 'answered-meanwhile' };
    throw err;
  }
  if (!result.changed) return { cancelled: false, reason: result.noopReason };

  let refunded = false;
  if (result.session.paymentStatus === 'paid') {
    const refund = await refundSession(result.session, {
      actor: ACTOR.SYSTEM,
      amount: result.session.price,
      reason: by === 'patient' ? 'Instant request withdrawn before the therapist answered' : 'Therapist did not answer the instant request'
    });
    refunded = refund.refunded;
    if (refund.failed) {
      logger.error('Refund of an unanswered instant request failed; it is in the admin retry queue', { sessionId: short });
    }
  }

  // A strike means "you were asked and did not answer": the ring reached the
  // doctor and the window ran out. A patient giving up early, or a ring
  // emitted into an empty room, is neither.
  const deadlinePassed = !session.acceptanceDeadline || new Date(session.acceptanceDeadline) <= now;
  if (deadlinePassed && session.ringDeliveredAt) {
    await doctorCounters.increment(session.doctorId._id || session.doctorId, 'cancel', { now });
  } else if (by === 'system') {
    logger.warn('Instant request expired without ever reaching the doctor — not counted against them', { sessionId: short });
  }

  const patientId = String(session.patientId._id || session.patientId);
  const doctorId = String(session.doctorId._id || session.doctorId);
  const message = by === 'patient'
    ? 'The request was withdrawn before the therapist answered.'
    : 'Doctor is unavailable. Session cancelled.';

  try {
    const patient = await User.findById(patientId).select('firstName email');
    if (patient && patient.email) {
      await emailService.sendCancellationEmail(patient.email, {
        recipientName: patient.firstName,
        date: displayWhen(result.session).date,
        time: displayWhen(result.session).time,
        cancelledBy: by === 'patient' ? 'You' : 'System (Doctor Unavailable)',
        refundAmount: refunded ? result.session.price : 0,
        message: refunded
          ? `${message} A full refund has been initiated automatically.`
          : message
      });
    }
  } catch (e) { logger.warn('Missed session email failed', { error: e.message }); }

  require('../services/liveUpdates').sessionCancelled(io, { _id: sessionId, patientId, doctorId }, {
    byRole: by === 'patient' ? 'patient' : 'system', refundAmount: refunded ? result.session.price : 0, message
  });
  return { cancelled: true, refunded, session: result.session };
}

/** POST /api/sessions/:sessionId/missed — the patient gives up on an unanswered instant request */
const missedSession = asyncHandler(async (req, res) => {
  // Authorization is declared on the route as authorize('session:mark-missed')
  // and restricts this to the session's own patient.
  //
  // It is also restricted to what it is FOR. It used to accept any session
  // that was not accepted/cancelled/completed — and acceptanceStatus defaults
  // to 'pending' on every booking — so a patient could call it on a regular
  // booking an hour before it started and take a 100% refund the published
  // 4-hour policy does not give.
  const session = req.authz.resource;

  if (session.sessionType !== 'immediate') {
    return res.status(400).json({ success: false, message: 'Only an unanswered instant request can be reported as missed. To cancel a booking, use Cancel.' });
  }
  if (session.acceptanceStatus === 'accepted' || session.doctorJoined) {
    return res.status(409).json({ success: false, message: 'Session already accepted' });
  }
  if (!['payment_pending', 'active'].includes(session.status)) {
    return res.json({ success: false, message: `Session is already ${session.status}` });
  }

  const result = await _autoCancelUnacceptedSession(session, req.app.get('io'), { by: 'patient' });
  if (!result.cancelled) {
    return res.status(409).json({ success: false, message: 'The therapist has just answered this request.' });
  }
  res.json({ success: true, message: 'Session marked as missed', refunded: result.refunded, session: result.session });
});

/**
 * Scheduled sweep (called from services/scheduler.js): every instant request
 * whose window has closed without the doctor answering.
 */
const sweepStuckUnacceptedSessions = async (io) => {
  const now = new Date();
  // Rows created before acceptanceDeadline existed still have to resolve, so
  // they keep the old createdAt / delayedUntil rules.
  const legacyCutoff = new Date(now.getTime() - INSTANT_ACCEPT_WINDOW_MINUTES * MINUTE_MS);
  const legacyDelayCutoff = new Date(now.getTime() - DELAY_GRACE_MINUTES * MINUTE_MS);

  const stuck = await Session.find({
    sessionType: 'immediate',
    ...STILL_WAITING,
    // callStatus is deliberately NOT a condition. The patient sets it to
    // 'in-progress' by opening the waiting lounge, so excluding it meant a
    // patient who waited in the room for a doctor who never came was never
    // refunded. doctorJoined is the real "the call is happening" signal.
    $or: [
      { acceptanceDeadline: { $lte: now } },
      { acceptanceDeadline: null, acceptanceStatus: 'pending', createdAt: { $lte: legacyCutoff } },
      { acceptanceDeadline: null, acceptanceStatus: 'delayed', delayedUntil: { $lte: legacyDelayCutoff } }
    ]
  });

  let cancelled = 0;
  for (const session of stuck) {
    try {
      const result = await _autoCancelUnacceptedSession(session, io, { by: 'system', now });
      if (result.cancelled) {
        cancelled += 1;
        logger.info('Auto-cancelled unanswered instant request', { sessionId: session._id.toString().substring(0, 8), refunded: result.refunded });
      }
    } catch (err) {
      logger.error('Failed to auto-cancel stuck session', { sessionId: session._id.toString(), error: err.message });
    }
  }
  return cancelled;
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

/**
 * GET /api/sessions/:sessionId/ice-servers — STUN + a TURN relay for this
 * call (services/turnCredentials.js). Bound to the session: only its two
 * people, only while it can still be held.
 */
const getIceServers = asyncHandler(async (req, res) => {
  const session = req.authz.resource;
  const { LIVE_STATUSES } = require('../services/sessionState');
  if (!LIVE_STATUSES.includes(session.status)) {
    return res.status(409).json({ success: false, code: 'CLOSED', message: 'This session is no longer open.' });
  }
  const { resolveEndsAt } = require('../services/sessionTime');
  let endsAt = session.effectiveEndsAt || null;
  try { endsAt = endsAt || resolveEndsAt(session); } catch (e) { endsAt = null; }
  const turn = require('../services/turnCredentials');
  const result = await turn.getIceServers({ userId: req.actor.id, sessionId: String(session._id), sessionEndsAt: endsAt });
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...result });
});

module.exports = { getStats, getMyDoctors, getPendingFeedback, getCallHistory, getDoctorSlots, bookImmediate, bookSession, getMySessions, getUpcoming, getAllDoctors, getDoctorById, getSessionById, joinSession, completeSession, requestEndSession, respondEndSession, claimAbsentRefund, abandonCheckout, cancelSession, getCalendar, getPatientEmergencyContact, getMyTherapists, acceptSession, delaySession, getIceServers, missedSession, getDelayedSessions, getInstantRequests, sweepStuckUnacceptedSessions };
