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
const { getRazorpay } = require('../services/razorpay.client');
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

    const doctor = doctorProfile.userId;
    if (!doctor.phoneNumber) {
      return res.status(400).json({
        message: 'Doctor has no phone number set. They must add one before onboarding.'
      });
    }

    // No Razorpay call.
    //
    // This function used to create a Razorpay Route linked account, and — on
    // ANY error from that call — fabricate `acc_mock_<hex>` and mark the
    // doctor 'active' anyway. That is how every doctor on the platform ended
    // up holding an id no money could ever route to, while their own Pricing &
    // Payouts page told them "Your payout account is active". Meanwhile
    // resolveBookingPaymentState refused to book them precisely because the id
    // was synthetic. The two halves contradicted each other and the doctor was
    // shown the reassuring one.
    //
    // Route is not available to this platform anyway (it now requires an RBI
    // Payment Aggregator turnover threshold), so payments land in the platform
    // account and doctors are paid by bank transfer on a weekly cycle.
    // Approval is therefore a decision an admin records, not an integration
    // that can half-succeed — and it cannot silently claim to have worked.
    doctorProfile.payoutApproved = true;
    doctorProfile.payoutApprovedAt = new Date();
    doctorProfile.payoutApprovedBy = req.admin ? req.admin._id : null;
    doctorProfile.razorpayOnboardingStatus = 'active';
    doctorProfile.razorpayActivatedAt = new Date();
    doctorProfile.razorpayKYCRejectionReason = null;
    await doctorProfile.save();

    logger.info('[Admin] Doctor approved for payouts', { doctorId: String(doctorId).substring(0, 8) });

    // Notify doctor by email
    try {
      const emailService = require('../services/email.service');
      if (emailService.sendOnboardingApprovedEmail) {
        await emailService.sendOnboardingApprovedEmail(doctor.email, doctor.firstName);
      }
    } catch (e) {
      logger.warn('[Admin] Onboarding approval email failed:', { error: e.message });
    }

    res.json({
      success: true,
      message: 'Doctor approved for payouts. They can now be booked.',
      payoutApproved: true,
      status: 'active'
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
 * Admin triggers a manual refund for a session
 */
exports.adminRefundSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    // Admins can pass an explicit override amount (goodwill/support refunds), but by
    // default this now applies the SAME tiered policy the patient-facing cancellation
    // flow uses (server/services/refundPolicy.js), rather than always refunding the
    // full price regardless of how close to the session it is — that inconsistency
    // meant a session cancelled 2 hours out (0% tier) still got refunded in full when
    // an admin processed it, which is a real financial-policy disagreement between
    // the two paths, not just a hypothetical one.
    const { reason = 'Admin initiated refund', refundAmount: overrideAmount } = req.body;

    const session = await Session.findById(sessionId)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.paymentStatus !== 'paid') {
      return res.status(400).json({
        message: `Cannot refund — payment status is "${session.paymentStatus}"`
      });
    }

    if (!session.paymentId) {
      return res.status(400).json({ message: 'No payment ID on record. Cannot process refund.' });
    }

    let refundAmount;
    if (typeof overrideAmount === 'number' && overrideAmount >= 0 && overrideAmount <= session.price) {
      refundAmount = overrideAmount;
      logger.warn('Admin override refund amount used', {
        sessionId: sessionId.toString().substring(0, 8),
        overrideAmount,
        adminId: req.admin?._id?.toString().substring(0, 8)
      });
    } else {
      // Same tier calculation the patient-facing cancel path uses, from the
      // same authoritative instant — the two used to compute it separately.
      const hoursUntil = hoursUntilStart(session);
      // An admin manually processing a refund is standing in for whichever side
      // actually triggered/deserves the cancellation; since that context isn't
      // captured here, use the patient-tier calculation — the more common case
      // for this tool (resolving a stuck/failed refund) inherits the same tiers
      // the patient was already shown at cancellation time.
      refundAmount = calculateRefund(session.price, hoursUntil, 'patient');
    }

    // Skip mock payments
    if (session.paymentId.startsWith('mock_') || session.paymentId.startsWith('immediate_')) {
      session.paymentStatus = 'refunded';
      session.status = 'cancelled';
      session.refundId = `refund_mock_${Date.now()}`;
      session.refundedAt = new Date();
      session.refundAmount = refundAmount;
      await session.save();
      return res.json({ success: true, message: 'Mock refund processed.', refundId: session.refundId, amount: refundAmount });
    }

    // Real Razorpay refund
    const refund = refundAmount > 0
      ? await getRazorpay().payments.refund(session.paymentId, {
          amount: refundAmount * 100, // paise
          speed: 'normal',
          notes: { reason, sessionId: sessionId.toString(), adminId: req.admin?._id?.toString() }
        })
      : null;

    session.paymentStatus = 'refunded';
    session.status = 'cancelled';
    session.refundId = refund ? refund.id : `refund_zero_${Date.now()}`;
    session.refundedAt = new Date();
    session.refundAmount = refundAmount;
    await session.save();

    logger.info('Admin refund issued', { refundId: session.refundId, sessionId: sessionId.toString().substring(0, 8), amount: refundAmount });

    // Send refund email to patient
    try {
      const emailService = require('../services/email.service');
      if (session.patientId?.email) {
        await emailService.sendRefundInitiatedEmail(session.patientId.email, {
          patientName: session.patientId.firstName,
          amount: refundAmount,
          refundId: session.refundId,
          date: new Date(session.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        });
      }
    } catch (e) { logger.warn('Refund email failed', { error: e.message }); }

    res.json({
      success: true,
      message: `Refund of ₹${refundAmount} initiated successfully.`,
      refundId: session.refundId,
      amount: refundAmount,
      status: refund ? refund.status : 'not_applicable'
    });
  } catch (error) {
    logger.error('adminRefundSession error', { error: error.message });
    res.status(500).json({ message: 'Failed to process refund', error: error.message });
  }
};

/**
 * GET /api/admin/payments/sessions/failed-refunds
 * List all sessions with paymentStatus = 'refund_failed' for admin review
 */
exports.getFailedRefunds = async (req, res) => {
  try {
    const sessions = await Session.find({ paymentStatus: 'refund_failed' })
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
        paymentId: s.paymentId,
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
 * Retry a stuck refund_failed session
 */
exports.retryRefund = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findById(sessionId)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');

    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.paymentStatus !== 'refund_failed') {
      return res.status(400).json({ message: `Session paymentStatus is "${session.paymentStatus}", not "refund_failed"` });
    }
    if (!session.paymentId || session.paymentId.startsWith('mock_') || session.paymentId.startsWith('immediate_')) {
      // Mock payment — just mark refunded
      session.paymentStatus = 'refunded';
      session.refundedAt = new Date();
      session.refundAmount = session.price;
      await session.save();
      return res.json({ success: true, message: 'Mock refund marked as complete.' });
    }

    const refund = await getRazorpay().payments.refund(session.paymentId, {
      amount: (session.refundAmount || session.price) * 100,
      speed: 'normal',
      notes: { reason: 'Admin retry refund', sessionId: sessionId.toString() }
    });

    session.paymentStatus = 'refunded';
    session.refundId = refund.id;
    session.refundedAt = new Date();
    session.refundAmount = session.refundAmount || session.price;
    await session.save();

    // Notify patient
    try {
      const emailService = require('../services/email.service');
      if (session.patientId?.email) {
        await emailService.sendRefundInitiatedEmail(session.patientId.email, {
          patientName: session.patientId.firstName,
          amount: session.refundAmount,
          refundId: refund.id,
          date: new Date(session.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        });
      }
    } catch (e) { logger.warn('[Admin] Retry refund email failed:', { error: e.message }); }

    logger.info(`[Admin] Retry refund ${refund.id} for session ${sessionId}`);
    res.json({ success: true, message: `Refund retried successfully. Refund ID: ${refund.id}`, refundId: refund.id });
  } catch (error) {
    logger.error('[Admin] retryRefund error:', { error: error.message });
    res.status(500).json({ message: 'Refund retry failed', error: error.message });
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
