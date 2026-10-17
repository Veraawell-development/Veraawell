/**
 * Admin Payments Controller
 * Handles: platform fee management, payout onboarding approvals, revenue analytics
 */

const DoctorProfile = require('../models/doctorProfile');
const User = require('../models/user');
const Session = require('../models/session');
const PlatformSettings = require('../models/platformSettings');
const { calculateRefund } = require('../services/refundPolicy');
const { payableSessionMatch } = require('../services/earnings');
const { hoursUntilStart } = require('../services/sessionTime');
const { refundSession, reconcileStuckRefund, STUCK_REFUND_MINUTES } = require('../services/sessionRefund');
const { releaseSessionSlot } = require('../services/sessionPayment');
const { applyTransition } = require('../services/sessionTransition');
const { EVENT, ACTOR, LIVE_STATUSES, isTerminalStatus } = require('../services/sessionState');
const { createLogger } = require('../utils/logger');

const logger = createLogger('ADMIN-PAYMENTS');


// ═══════════════════════════════════════════════════════════════════════
// PHASE 2 — PLATFORM FEE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/payments/settings
 * Get current platform fee settings
 */
exports.getPaymentSettings = async (req, res) => {
  try {
    const settings = await PlatformSettings.getSettings();
    res.json({
      success: true,
      defaultPlatformFeePercentage: settings.defaultPlatformFeePercentage,
      lastUpdated: settings.lastUpdated,
      updatedBy: settings.updatedBy
    });
  } catch (error) {
    logger.error('[Admin] getPaymentSettings error:', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
};

/**
 * PATCH /api/admin/payments/settings/fee
 * Update global platform fee percentage (super admin only)
 */
exports.updatePlatformFee = async (req, res) => {
  try {
    const { defaultPlatformFeePercentage } = req.body;

    if (defaultPlatformFeePercentage === undefined || defaultPlatformFeePercentage === null) {
      return res.status(400).json({ message: 'defaultPlatformFeePercentage is required' });
    }

    const fee = Number(defaultPlatformFeePercentage);
    if (isNaN(fee) || fee < 0 || fee > 100) {
      return res.status(400).json({ message: 'Fee must be between 0 and 100' });
    }

    const settings = await PlatformSettings.getSettings();
    settings.defaultPlatformFeePercentage = fee;
    settings.updatedBy = req.admin?._id || null;
    settings.lastUpdated = new Date();
    await settings.save();

    logger.info(`[Admin] Platform fee updated to ${fee}% by admin`);

    res.json({
      success: true,
      message: `Platform fee updated to ${fee}%`,
      defaultPlatformFeePercentage: fee
    });
  } catch (error) {
    logger.error('[Admin] updatePlatformFee error:', { error: error.message });
    res.status(500).json({ message: 'Failed to update platform fee' });
  }
};

/**
 * PATCH /api/admin/payments/doctors/:doctorId/fee
 * Override fee for a specific doctor (or reset to global default)
 */
exports.updateDoctorFee = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { customFeePercentage } = req.body; // null = reset to global default

    const doctorProfile = await DoctorProfile.findOne({ userId: doctorId });
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    if (customFeePercentage !== null && customFeePercentage !== undefined) {
      const fee = Number(customFeePercentage);
      if (isNaN(fee) || fee < 0 || fee > 100) {
        return res.status(400).json({ message: 'Fee must be between 0 and 100' });
      }
      doctorProfile.customFeePercentage = fee;
    } else {
      doctorProfile.customFeePercentage = null; // reset to global
    }

    await doctorProfile.save();

    const settings = await PlatformSettings.getSettings();

    res.json({
      success: true,
      message: customFeePercentage !== null
        ? `Doctor fee overridden to ${customFeePercentage}%`
        : `Doctor fee reset to global default (${settings.defaultPlatformFeePercentage}%)`,
      customFeePercentage: doctorProfile.customFeePercentage,
      effectiveFee: doctorProfile.customFeePercentage ?? settings.defaultPlatformFeePercentage
    });
  } catch (error) {
    logger.error('[Admin] updateDoctorFee error:', { error: error.message });
    res.status(500).json({ message: 'Failed to update doctor fee' });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3 — PAYOUT ONBOARDING APPROVALS
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/payments/onboarding-requests
 * List all doctors pending admin approval
 */
exports.getOnboardingRequests = async (req, res) => {
  try {
    const { status = 'pending_admin_approval' } = req.query;

    const validStatuses = ['not_requested', 'pending_admin_approval', 'submitted_to_razorpay', 'active', 'rejected', 'all'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status filter' });
    }

    const query = status === 'all' ? {} : { razorpayOnboardingStatus: status };

    const doctors = await DoctorProfile.find(query)
      .populate('userId', 'firstName lastName email phoneNumber')
      .select('userId razorpayOnboardingStatus razorpayOnboardingRequestedAt razorpayActivatedAt customFeePercentage razorpayAccountId')
      .sort({ razorpayOnboardingRequestedAt: -1 })
      .lean();

    const result = doctors
      .filter(d => d.userId) // safety: skip orphaned profiles
      .map(d => ({
        doctorId: d.userId._id,
        name: `${d.userId.firstName} ${d.userId.lastName}`,
        email: d.userId.email,
        phone: d.userId.phoneNumber,
        onboardingStatus: d.razorpayOnboardingStatus || 'not_requested',
        requestedAt: d.razorpayOnboardingRequestedAt,
        activatedAt: d.razorpayActivatedAt,
        customFeePercentage: d.customFeePercentage,
        hasRazorpayAccount: !!d.razorpayAccountId,
        razorpayAccountId: d.razorpayAccountId
      }));

    res.json({ success: true, count: result.length, doctors: result });
  } catch (error) {
    logger.error('[Admin] getOnboardingRequests error:', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch onboarding requests' });
  }
};

/**
 * POST /api/admin/payments/onboarding-requests/:doctorId/approve
 * Admin approves a doctor's onboarding request — creates their Razorpay Linked Account
 */
exports.approveOnboarding = async (req, res) => {
  try {
    const { doctorId } = req.params;

    const doctorProfile = await DoctorProfile.findOne({ userId: doctorId }).populate('userId');
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    if (doctorProfile.payoutApproved) {
      return res.status(400).json({ message: 'This doctor is already approved for payouts' });
    }

    // An admin approves a request; they do not conscript a doctor who never
    // asked. Keeping this guard also means the approval queue and the approve
    // action agree on what is actionable.
    if (doctorProfile.razorpayOnboardingStatus !== 'pending_admin_approval') {
      return res.status(400).json({
        message: `Cannot approve — current status is "${doctorProfile.razorpayOnboardingStatus || 'not_requested'}"`
      });
    }

    // This used to set payoutApproved = true. That is the switch that makes a
    // therapist bookable and tells the weekly payout run where to send their
    // money — and this path flipped it with no bank details on file at all,
    // reachable by any admin. Payout approval now happens in exactly one
    // place, approving the therapist's bank details (super admin only), where
    // the account the money will go to is actually reviewed.
    return res.status(409).json({
      message: 'Payout approval now happens by approving the therapist\'s bank details (Super Admin → Bank Details). Ask them to submit their bank details from Settings.'
    });
  } catch (error) {
    logger.error('[Admin] approveOnboarding error:', { error: error.message });
    res.status(500).json({ message: 'Failed to approve onboarding' });
  }
};

/**
 * POST /api/admin/payments/onboarding-requests/:doctorId/reject
 * Admin rejects a doctor's onboarding request
 */
exports.rejectOnboarding = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { reason = 'Application does not meet requirements.' } = req.body;

    const doctorProfile = await DoctorProfile.findOne({ userId: doctorId }).populate('userId');
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    // Revoke bookability too: a rejected doctor with payoutApproved still true
    // would keep taking bookings the platform has no approved way to settle.
    doctorProfile.payoutApproved = false;
    doctorProfile.payoutApprovedAt = null;
    doctorProfile.razorpayOnboardingStatus = 'rejected';
    doctorProfile.razorpayKYCRejectionReason = reason;
    await doctorProfile.save();

    // Notify doctor
    try {
      const emailService = require('../services/email.service');
      if (emailService.sendOnboardingRejectedEmail) {
        await emailService.sendOnboardingRejectedEmail(
          doctorProfile.userId.email,
          doctorProfile.userId.firstName,
          reason
        );
      }
    } catch (e) {
      logger.warn('[Admin] Rejection email failed:', { error: e.message });
    }

    res.json({
      success: true,
      message: 'Onboarding request rejected. Doctor has been notified.',
      status: 'rejected'
    });
  } catch (error) {
    logger.error('[Admin] rejectOnboarding error:', { error: error.message });
    res.status(500).json({ message: 'Failed to reject onboarding' });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// PHASE 5 — ADMIN REFUND
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/payments/sessions/:sessionId/refund
 * Admin triggers a manual refund for a session.
 *
 * Through sessionRefund, like every other refund. This used to call Razorpay
 * and then write `refunded` with a raw save(): no claim, so a double-clicked
 * button refunded twice; a fabricated `refund_zero_<ts>` id when the policy
 * gave nothing, recording a refund that never happened; and a live booking
 * marked refunded and cancelled without its slot being released.
 */
exports.adminRefundSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    // Admins can pass an explicit amount (goodwill/support refunds). By
    // default the patient-facing policy applies, so the two paths agree.
    const { reason = 'Admin initiated refund', refundAmount: overrideAmount } = req.body;

    let session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (!['paid', 'refund_failed'].includes(session.paymentStatus)) {
      return res.status(400).json({ message: `Cannot refund — payment status is "${session.paymentStatus}"` });
    }

    let refundAmount;
    if (overrideAmount !== undefined && overrideAmount !== null && overrideAmount !== '') {
      const amount = Number(overrideAmount);
      if (!(amount > 0) || amount > session.price) {
        return res.status(400).json({ message: `Refund amount must be more than 0 and at most ₹${session.price}` });
      }
      refundAmount = Math.round(amount * 100) / 100;
      logger.warn('Admin override refund amount used', {
        sessionId: sessionId.toString().substring(0, 8),
        overrideAmount: refundAmount,
        adminId: req.actor.id ? String(req.actor.id).substring(0, 8) : null
      });
    } else {
      refundAmount = calculateRefund(session.price, hoursUntilStart(session), 'patient');
      if (!(refundAmount > 0)) {
        return res.status(400).json({
          message: 'The refund policy gives nothing for this session. Enter an amount to refund it anyway.'
        });
      }
    }

    // A refunded booking cannot stay live: cancel it (and free its slot)
    // first. The transition table only accepts money events on a terminal
    // session for exactly this reason.
    if (LIVE_STATUSES.includes(session.status)) {
      const cancelled = await applyTransition(session, {
        event: EVENT.CANCEL,
        actor: ACTOR.ADMIN,
        payload: { cancelledBy: 'admin' }
      });
      session = cancelled.session;
      if (cancelled.changed) await releaseSessionSlot(session);
    }
    if (!isTerminalStatus(session.status)) {
      return res.status(400).json({ message: `Cannot refund a session that is "${session.status}"` });
    }

    const result = await refundSession(session, { actor: ACTOR.ADMIN, amount: refundAmount, reason });
    if (result.skipped) {
      const messages = {
        'no-real-payment': 'This session has no real payment to refund.',
        'claim-noop': 'A refund for this session is already in progress or done.'
      };
      return res.status(409).json({ message: messages[result.skipped] || `Refund not issued (${result.skipped})` });
    }
    if (result.failed) {
      return res.status(502).json({
        message: `Razorpay rejected the refund: ${result.session && result.session.refundFailureReason ? result.session.refundFailureReason : 'unknown error'}. It is in the failed-refunds queue.`
      });
    }

    logger.info('Admin refund issued', { refundId: result.refundId, sessionId: sessionId.toString().substring(0, 8), amount: refundAmount });

    try {
      const patient = await User.findById(session.patientId).select('firstName email');
      const emailService = require('../services/email.service');
      if (patient && patient.email) {
        await emailService.sendRefundInitiatedEmail(patient.email, {
          patientName: patient.firstName,
          amount: refundAmount,
          refundId: result.refundId,
          date: new Date(session.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        });
      }
    } catch (e) { logger.warn('Refund email failed', { error: e.message }); }

    res.json({
      success: true,
      message: `Refund of ₹${refundAmount} initiated successfully.`,
      refundId: result.refundId,
      amount: refundAmount
    });
  } catch (error) {
    logger.error('adminRefundSession error', { error: error.message });
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Failed to process refund' });
  }
};

/**
 * GET /api/admin/payments/sessions/failed-refunds
 * Refunds that need a person: those Razorpay rejected, and those claimed and
 * never recorded (a crash mid-refund) that the hourly sweep has not resolved.
 */
exports.getFailedRefunds = async (req, res) => {
  try {
    const stuckBefore = new Date(Date.now() - STUCK_REFUND_MINUTES * 60 * 1000);
    const sessions = await Session.find({
      $or: [
        { paymentStatus: 'refund_failed' },
        { paymentStatus: 'refund_pending', updatedAt: { $lte: stuckBefore } }
      ]
    })
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email')
      .sort({ updatedAt: -1 })
      .limit(100);

    res.json({
      success: true,
      count: sessions.length,
      sessions: sessions.map(s => ({
        _id: s._id,
        patientName: s.patientId ? `${s.patientId.firstName} ${s.patientId.lastName}` : 'Unknown',
        patientEmail: s.patientId?.email,
        doctorName: s.doctorId ? `Dr. ${s.doctorId.firstName} ${s.doctorId.lastName}` : 'Unknown',
        sessionDate: s.sessionDate,
        sessionTime: s.sessionTime,
        price: s.price,
        refundAmount: s.refundAmount,
        paymentId: s.paymentId,
        paymentStatus: s.paymentStatus,
        failureReason: s.refundFailureReason || null,
        cancelledBy: s.cancelledBy,
        updatedAt: s.updatedAt
      }))
    });
  } catch (error) {
    logger.error('[Admin] getFailedRefunds error:', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch failed refunds' });
  }
};

/**
 * POST /api/admin/payments/sessions/:sessionId/retry-refund
 * Retry a refund Razorpay rejected, or resolve one stuck mid-flight.
 */
exports.retryRefund = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (session.paymentStatus === 'refund_pending') {
      // Never blind: asks Razorpay whether the money already moved first.
      const result = await reconcileStuckRefund(session);
      const messages = {
        'recorded-existing': 'Razorpay had already processed this refund — it is now recorded.',
        refunded: 'Refund sent.',
        failed: 'Razorpay rejected the refund again. See the failure reason.',
        'too-recent': 'This refund was started moments ago and may still be in flight. Try again in a few minutes.',
        'gateway-unavailable': 'Could not reach Razorpay to check this refund. Try again shortly.'
      };
      const ok = ['recorded-existing', 'refunded'].includes(result.resolved);
      return res.status(ok ? 200 : 409).json({ success: ok, message: messages[result.resolved] || result.resolved });
    }

    if (session.paymentStatus !== 'refund_failed') {
      return res.status(400).json({ message: `Session paymentStatus is "${session.paymentStatus}", not a failed refund` });
    }

    const amount = session.refundAmount > 0 ? session.refundAmount : session.price;
    const result = await refundSession(session, { actor: ACTOR.ADMIN, amount, reason: 'Admin retry refund' });
    if (result.skipped === 'no-real-payment') {
      return res.status(409).json({ message: 'This session has no real payment to refund.' });
    }
    if (!result.refunded) {
      return res.status(502).json({
        message: `Refund retry failed: ${result.session && result.session.refundFailureReason ? result.session.refundFailureReason : (result.skipped || 'unknown error')}`
      });
    }

    try {
      const patient = await User.findById(session.patientId).select('firstName email');
      const emailService = require('../services/email.service');
      if (patient && patient.email) {
        await emailService.sendRefundInitiatedEmail(patient.email, {
          patientName: patient.firstName,
          amount,
          refundId: result.refundId,
          date: new Date(session.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        });
      }
    } catch (e) { logger.warn('[Admin] Retry refund email failed:', { error: e.message }); }

    logger.info('[Admin] Refund retried', { sessionId: String(sessionId).substring(0, 8), refundId: result.refundId });
    res.json({ success: true, message: `Refund retried successfully. Refund ID: ${result.refundId}`, refundId: result.refundId });
  } catch (error) {
    logger.error('[Admin] retryRefund error:', { error: error.message });
    res.status(500).json({ message: 'Refund retry failed' });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// PHASE 8 — REVENUE ANALYTICS
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/payments/revenue
 * Platform revenue analytics — total, monthly breakdown, per-doctor
 */
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = daysMap[period] || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [overallStats, timeSeriesStats, topDoctors] = await Promise.all([
      // Overall totals
      Session.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            totalPlatformFee: { $sum: '$platformFee' },
            totalDoctorEarnings: { $sum: '$doctorEarnings' },
            totalSessions: { $count: {} }
          }
        }
      ]),

      // Daily time series for charts
      Session.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$price' },
            platformFee: { $sum: '$platformFee' },
            sessions: { $count: {} }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // Top earning doctors.
      //
      // The payable predicate, so this agrees with each doctor's own
      // dashboard and with what the weekly payout run will pay. The two
      // aggregations above deliberately keep the broader
      // `paymentStatus: 'paid'` filter: they answer "what did we collect",
      // which legitimately includes sessions not yet delivered. This one
      // answers "what have practitioners earned", which does not.
      Session.aggregate([
        { $match: { ...payableSessionMatch(), createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$doctorId',
            grossRevenue: { $sum: '$price' },
            platformFee: { $sum: '$platformFee' },
            doctorEarnings: { $sum: '$doctorEarnings' },
            sessions: { $count: {} }
          }
        },
        { $sort: { grossRevenue: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'doctor'
          }
        },
        { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            name: { $concat: ['Dr. ', '$doctor.firstName', ' ', { $ifNull: ['$doctor.lastName', ''] }] },
            email: '$doctor.email',
            grossRevenue: 1,
            platformFee: 1,
            doctorEarnings: 1,
            sessions: 1
          }
        }
      ])
    ]);

    const overall = overallStats[0] || {
      totalRevenue: 0, totalPlatformFee: 0, totalDoctorEarnings: 0, totalSessions: 0
    };

    // Pending refunds
    const pendingRefunds = await Session.countDocuments({ paymentStatus: 'paid', status: 'cancelled' });

    res.json({
      success: true,
      period,
      summary: {
        totalRevenue: overall.totalRevenue,
        totalPlatformFee: overall.totalPlatformFee,
        totalDoctorEarnings: overall.totalDoctorEarnings,
        totalSessions: overall.totalSessions,
        pendingRefunds
      },
      timeSeries: timeSeriesStats,
      topDoctors
    });
  } catch (error) {
    logger.error('[Admin] getRevenueAnalytics error:', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch revenue analytics' });
  }
};
