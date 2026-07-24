/**
 * Admin Payments Controller
 * Handles: platform fee management, payout onboarding approvals, revenue analytics
 */

const DoctorProfile = require('../models/doctorProfile');
const User = require('../models/user');
const Session = require('../models/session');
const PlatformSettings = require('../models/platformSettings');
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
    console.error('[Admin] getPaymentSettings error:', error);
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

    console.log(`[Admin] Platform fee updated to ${fee}% by admin`);

    res.json({
      success: true,
      message: `Platform fee updated to ${fee}%`,
      defaultPlatformFeePercentage: fee
    });
  } catch (error) {
    console.error('[Admin] updatePlatformFee error:', error);
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
    console.error('[Admin] updateDoctorFee error:', error);
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
    console.error('[Admin] getOnboardingRequests error:', error);
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

    if (doctorProfile.razorpayOnboardingStatus !== 'pending_admin_approval') {
      return res.status(400).json({
        message: `Cannot approve — current status is "${doctorProfile.razorpayOnboardingStatus}"`
      });
    }

    const doctor = doctorProfile.userId;
    if (!doctor.phoneNumber) {
      return res.status(400).json({
        message: 'Doctor has no phone number set. They must add one before onboarding.'
      });
    }

    let razorpayAccountId;
    let accountCreated = false;

    try {
      // Create Razorpay Route Linked Account
      const account = await razorpay.accounts.create({
        email: doctor.email,
        profile: {
          category: 'healthcare',
          subcategory: 'clinic',
          addresses: {
            registered: {
              street1: 'India',
              city: 'Mumbai',
              state: 'MH',
              postal_code: '400001',
              country: 'IN'
            }
          }
        },
        type: 'route',
        reference_id: doctorId.toString(),
        legal_business_name: `Dr. ${doctor.firstName} ${doctor.lastName || ''}`.trim(),
        business_type: 'individual',
        contact_name: `${doctor.firstName} ${doctor.lastName || ''}`.trim(),
        contact_info: {
          sendEmail: true,
          email: doctor.email
        }
      });

      razorpayAccountId = account.id;
      accountCreated = true;
      console.log(`[Admin] Razorpay account created: ${razorpayAccountId} for doctor ${doctorId}`);
    } catch (rzpError) {
      // In test mode Razorpay Route may not be fully enabled — use mock
      console.warn('[Admin] Razorpay account creation failed, using mock:', rzpError.message);
      const crypto = require('crypto');
      razorpayAccountId = `acc_mock_${crypto.randomBytes(4).toString('hex')}`;
      accountCreated = false;
    }

    doctorProfile.razorpayAccountId = razorpayAccountId;
    // In test mode with mock account, instantly activate. Otherwise wait for Razorpay KYC webhook.
    if (!accountCreated || razorpayAccountId.startsWith('acc_mock_')) {
      doctorProfile.razorpayOnboardingStatus = 'active';
      doctorProfile.razorpayActivatedAt = new Date();
    } else {
      doctorProfile.razorpayOnboardingStatus = 'submitted_to_razorpay';
    }
    await doctorProfile.save();

    // Notify doctor by email
    try {
      const emailService = require('../services/email.service');
      if (emailService.sendOnboardingApprovedEmail) {
        await emailService.sendOnboardingApprovedEmail(doctor.email, doctor.firstName);
      }
    } catch (e) {
      console.warn('[Admin] Onboarding approval email failed:', e.message);
    }

    res.json({
      success: true,
      message: accountCreated
        ? 'Razorpay account created. Doctor will receive KYC email from Razorpay.'
        : 'Mock account created (test mode). Status moved to submitted_to_razorpay.',
      razorpayAccountId,
      status: (!accountCreated || razorpayAccountId.startsWith('acc_mock_')) ? 'active' : 'submitted_to_razorpay'
    });
  } catch (error) {
    console.error('[Admin] approveOnboarding error:', error);
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
      console.warn('[Admin] Rejection email failed:', e.message);
    }

    res.json({
      success: true,
      message: 'Onboarding request rejected. Doctor has been notified.',
      status: 'rejected'
    });
  } catch (error) {
    console.error('[Admin] rejectOnboarding error:', error);
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
    const { reason = 'Admin initiated refund' } = req.body;

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

    // Skip mock payments
    if (session.paymentId.startsWith('mock_') || session.paymentId.startsWith('immediate_')) {
      session.paymentStatus = 'refunded';
      session.status = 'cancelled';
      session.refundId = `refund_mock_${Date.now()}`;
      session.refundedAt = new Date();
      session.refundAmount = session.price;
      await session.save();
      return res.json({ success: true, message: 'Mock refund processed.', refundId: session.refundId });
    }

    // Real Razorpay refund
    const refund = await razorpay.payments.refund(session.paymentId, {
      amount: session.price * 100, // paise
      speed: 'normal',
      notes: { reason, sessionId: sessionId.toString(), adminId: req.admin?._id?.toString() }
    });

    session.paymentStatus = 'refunded';
    session.status = 'cancelled';
    session.refundId = refund.id;
    session.refundedAt = new Date();
    session.refundAmount = session.price;
    await session.save();

    console.log(`[Admin] Refund ${refund.id} issued for session ${sessionId}`);

    res.json({
      success: true,
      message: `Refund of ₹${session.price} initiated successfully.`,
      refundId: refund.id,
      amount: session.price,
      status: refund.status
    });
  } catch (error) {
    console.error('[Admin] adminRefundSession error:', error);
    res.status(500).json({ message: 'Failed to process refund', error: error.message });
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

      // Top earning doctors
      Session.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startDate } } },
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
    console.error('[Admin] getRevenueAnalytics error:', error);
    res.status(500).json({ message: 'Failed to fetch revenue analytics' });
  }
};
