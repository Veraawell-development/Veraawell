const Razorpay = require('razorpay');
const crypto = require('crypto');
const Session = require('../models/session');
const DoctorProfile = require('../models/doctorProfile');
const User = require('../models/user');
const PlatformSettings = require('../models/platformSettings');
const SocketEmitter = require('../utils/socketEmitter');
const emailService = require('../services/email.service');

function _emitToUsers(req, event, data, userIds) {
  const io = req.app.get('io');
  console.log(`[PaymentVerify] _emitToUsers called for event ${event} to users ${userIds}`);
  if (io) {
    console.log(`[PaymentVerify] Socket.io instance found, emitting...`);
    new SocketEmitter(io).emitToUsers(userIds, event, data);
  } else {
    console.warn(`[PaymentVerify] Socket.io instance NOT found on req.app`);
  }
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * POST /api/payments/request-onboarding
 * Doctor requests payout setup. Does NOT call Razorpay.
 * Admin must approve before Razorpay is contacted.
 */
exports.requestOnboarding = async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can request payout setup' });
    }

    const doctorProfile = await DoctorProfile.findOne({ userId: req.user._id }).populate('userId');
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found. Please complete your profile first.' });
    }

    // Phone number required for Razorpay
    if (!doctorProfile.userId.phoneNumber) {
      return res.status(400).json({ message: 'Please add your phone number in settings before requesting payout setup.' });
    }

    // Block if already in progress or active
    const blockingStatuses = ['pending_admin_approval', 'submitted_to_razorpay', 'active'];
    const currentStatus = doctorProfile.razorpayOnboardingStatus || 'not_requested';
    if (blockingStatuses.includes(currentStatus)) {
      const messages = {
        pending_admin_approval: 'Your request is already pending admin review.',
        submitted_to_razorpay: 'Your account has been submitted to Razorpay. Check your email to complete KYC.',
        active: 'Your payout account is already active.'
      };
      return res.status(400).json({ message: messages[currentStatus] });
    }

    doctorProfile.razorpayOnboardingStatus = 'pending_admin_approval';
    doctorProfile.razorpayOnboardingRequestedAt = new Date();
    doctorProfile.razorpayKYCRejectionReason = null;
    await doctorProfile.save();

    console.log(`[Onboarding] Dr. ${req.user.firstName} requested payout setup.`);

    res.json({
      success: true,
      message: 'Request submitted. An admin will review and approve your payout setup.',
      status: 'pending_admin_approval'
    });

  } catch (error) {
    console.error('Error in requestOnboarding:', error);
    res.status(500).json({ message: 'Failed to submit onboarding request' });
  }
};

/**
 * GET /api/payments/onboarding-status
 * Returns the current Razorpay onboarding lifecycle status for the logged-in doctor.
 */
exports.getOnboardingStatus = async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can access this endpoint' });
    }

    const doctorProfile = await DoctorProfile.findOne({ userId: req.user._id });
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    const status = doctorProfile.razorpayOnboardingStatus || 'not_requested';

    const statusMessages = {
      not_requested: 'Set up your payouts to start receiving earnings.',
      pending_admin_approval: 'Your request is pending admin review. We will notify you via email.',
      submitted_to_razorpay: 'Your account has been submitted to Razorpay. Check your email to complete KYC verification.',
      active: 'Your payout account is active. Earnings are transferred within 3 business days after each completed session.',
      rejected: `Your request was rejected: ${doctorProfile.razorpayKYCRejectionReason || 'No reason provided'}. You may re-apply.`
    };

    res.json({
      status,
      message: statusMessages[status] || 'Unknown status',
      requestedAt: doctorProfile.razorpayOnboardingRequestedAt || null,
      activatedAt: doctorProfile.razorpayActivatedAt || null,
      isActive: doctorProfile.payoutSetupCompleted || false
    });

  } catch (error) {
    console.error('Error in getOnboardingStatus:', error);
    res.status(500).json({ message: 'Failed to fetch onboarding status' });
  }
};

/**
 * POST /api/payments/verify
 * Called by frontend immediately after Razorpay modal success.
 * Cryptographically verifies signature before marking session as paid.
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    // Verify HMAC signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.warn('[PaymentVerify] Signature mismatch', { orderId: razorpay_order_id });
      return res.status(400).json({ success: false, message: 'Payment verification failed. Invalid signature.' });
    }

    const session = await Session.findOne({ razorpayOrderId: razorpay_order_id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found for this payment' });
    }

    // Verify the patient is the one who paid
    if (session.patientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Idempotency: already paid — just return success
    if (session.paymentStatus === 'paid') {
      const populated = await Session.findById(session._id)
        .populate('patientId', 'firstName lastName email')
        .populate('doctorId', 'firstName lastName email');
      
      // Ensure the event is emitted even if the webhook beat us to it
      _emitToUsers(req, 'session:booked', { 
        session: populated, 
        patientId: session.patientId.toString(), 
        doctorId: session.doctorId.toString(), 
        sessionId: session._id.toString(), 
        timestamp: new Date() 
      }, [session.patientId.toString(), session.doctorId.toString()]);
      
      return res.json({ success: true, message: 'Payment already confirmed.', session: populated });
    }

    session.paymentStatus = 'paid';
    session.paymentId = razorpay_payment_id;
    session.status = session.sessionType === 'immediate' ? 'active' : 'scheduled';
    await session.save();

    const populated = await Session.findById(session._id)
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');

    // Notify doctor about the booking ONLY AFTER payment verification
    _emitToUsers(req, 'session:booked', { 
      session: populated, 
      patientId: session.patientId.toString(), 
      doctorId: session.doctorId.toString(), 
      sessionId: session._id.toString(), 
      timestamp: new Date() 
    }, [session.patientId.toString(), session.doctorId.toString()]);

    // Send emails
    try {
      if (populated.patientId && populated.patientId.email) {
        await emailService.sendBookingConfirmationEmail(populated.patientId.email, {
          date: new Date(session.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          time: session.sessionTime,
          type: session.sessionType === 'immediate' ? 'Immediate' : 'Regular'
        });
      }
    } catch (emailErr) {
      console.warn('[PaymentVerify] Email send failed:', emailErr.message);
    }

    console.log(`[PaymentVerify] Session ${session._id} payment confirmed.`);

    res.json({ success: true, message: 'Payment verified. Your session is confirmed!', session: populated });

  } catch (error) {
    console.error('Error in verifyPayment:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};


const WebhookEvent = require('../models/webhookEvent');

exports.razorpayWebhook = async (req, res) => {
  try {
    // ── SIGNATURE VERIFICATION (uses WEBHOOK secret, NOT key secret) ──────────
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== signature) {
      console.warn('[Webhook] Invalid signature received');
      return res.status(400).json({ message: 'Invalid signature' });
    }

    // ── IDEMPOTENCY CHECK ─────────────────────────────────────────────────
    const eventId = req.body.id; // Razorpay sends unique ID with every webhook
    if (eventId) {
      const alreadyProcessed = await WebhookEvent.findOne({ eventId });
      if (alreadyProcessed) {
        return res.status(200).json({ status: 'already_processed' }); // 200 stops Razorpay retrying
      }
      // Mark as processed immediately (before handling, to prevent race conditions)
      try {
        await WebhookEvent.create({ eventId, eventType: req.body.event });
      } catch (dupErr) {
        // Race condition: another request already inserted this eventId
        return res.status(200).json({ status: 'already_processed' });
      }
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`[Webhook] Received event: ${event}`);

    // ── payment.captured ─────────────────────────────────────────────────────
    if (event === 'payment.captured') {
      const payment = payload?.payment?.entity;
      if (payment) {
        const session = await Session.findOne({ razorpayOrderId: payment.order_id });
        if (session && session.paymentStatus !== 'paid') {
          session.paymentStatus = 'paid';
          session.paymentId = payment.id;
          session.status = session.sessionType === 'immediate' ? 'active' : 'scheduled';
          await session.save();
          console.log(`[Webhook] Session ${session._id} marked as paid via webhook.`);
        }
      }
    }

    // ── payment.failed ───────────────────────────────────────────────────────
    else if (event === 'payment.failed') {
      const payment = payload?.payment?.entity;
      if (payment) {
        const session = await Session.findOne({ razorpayOrderId: payment.order_id });
        if (session && session.paymentStatus === 'pending') {
          session.paymentStatus = 'failed';
          await session.save();
          console.log(`[Webhook] Session ${session._id} payment failed.`);
        }
      }
    }

    // ── account.activated / account.instantly_activated ─────────────────────
    else if (event === 'account.activated' || event === 'account.instantly_activated' || event === 'account.activated_kyc_pending') {
      const account = payload?.account?.entity;
      const referenceId = account?.reference_id; // This is the doctorId we passed at creation
      if (referenceId) {
        const doctorProfile = await DoctorProfile.findOne({ userId: referenceId });
        if (doctorProfile) {
          doctorProfile.payoutSetupCompleted = true;
          doctorProfile.razorpayOnboardingStatus = 'active';
          doctorProfile.razorpayActivatedAt = new Date();
          await doctorProfile.save();
          console.log(`[Webhook] Doctor ${referenceId} payout account activated.`);

          // Email doctor
          const doctor = await User.findById(referenceId);
          if (doctor) {
            try {
              const emailService = require('../services/email.service');
              await emailService.sendPayoutActivatedEmail(doctor.email, doctor.firstName);
            } catch (e) { console.warn('[Webhook] Activation email failed:', e.message); }
          }
        }
      }
    }

    // ── account.rejected ────────────────────────────────────────────────────
    else if (event === 'account.rejected') {
      const account = payload?.account?.entity;
      const referenceId = account?.reference_id;
      
      if (referenceId) {
        const doctorProfile = await DoctorProfile.findOne({ userId: referenceId });
        if (doctorProfile) {
          doctorProfile.razorpayOnboardingStatus = 'not_requested'; // Allow re-apply
          doctorProfile.razorpayKYCRejectionReason = 'KYC rejected by Razorpay';
          doctorProfile.payoutSetupCompleted = false;
          await doctorProfile.save();
          console.log(`[Webhook] Doctor ${referenceId} payout account rejected.`);
          
          const doctor = await User.findById(referenceId);
          if (doctor) {
            const emailService = require('../services/email.service');
            try {
              await emailService.sendPayoutOnboardingRejectedEmail(
                doctor.email, doctor.firstName, 'Your KYC was not approved by Razorpay. Please contact support.'
              );
            } catch (e) { console.warn('Rejection email failed:', e.message); }
          }
        }
      }
    }

    // ── transfer.processed ───────────────────────────────────────────────────
    else if (event === 'transfer.processed') {
      const transfer = payload?.transfer?.entity;
      if (transfer) {
        // transfer.source is the order_id that triggered this transfer
        const session = await Session.findOne({ razorpayOrderId: transfer.source });
        if (session && !session.razorpayTransferId) {
          session.razorpayTransferId = transfer.id;
          await session.save();
          console.log(`[Webhook] Transfer ${transfer.id} saved for session ${session._id}`);
        }
      }
    }

    // ── refund.processed ─────────────────────────────────────────────────────
    else if (event === 'refund.processed') {
      const refund = payload?.refund?.entity;
      if (refund) {
        const session = await Session.findOne({ paymentId: refund.payment_id });
        if (session) {
          session.paymentStatus = 'refunded';
          if (!session.refundId) session.refundId = refund.id;
          if (!session.refundedAt) session.refundedAt = new Date(refund.created_at * 1000);
          if (!session.refundAmount) session.refundAmount = refund.amount / 100;
          await session.save();
          console.log(`[Webhook] Refund ${refund.id} confirmed for session ${session._id}`);
        }
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};
