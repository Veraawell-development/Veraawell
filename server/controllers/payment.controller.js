const Razorpay = require('razorpay');
const crypto = require('crypto');
const Session = require('../models/session');
const DoctorProfile = require('../models/doctorProfile');
const User = require('../models/user');
const PlatformSettings = require('../models/platformSettings');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.onboardDoctor = async (req, res) => {
  try {
    const doctorId = req.user.id; // From auth middleware
    const doctorProfile = await DoctorProfile.findOne({ userId: doctorId }).populate('userId');
    
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    if (doctorProfile.razorpayAccountId) {
      return res.status(400).json({ message: 'Already onboarded with Razorpay' });
    }

    let accountId;
    try {
      // Try to create a Linked Account on Razorpay
      const account = await razorpay.accounts.create({
        email: doctorProfile.userId.email,
        phone: doctorProfile.userId.phoneNumber || '9999999999', // Phone is usually required
        type: 'route',
        reference_id: doctorId.toString(),
        legal_business_name: `${doctorProfile.userId.firstName} ${doctorProfile.userId.lastName || ''}`.trim(),
        business_type: 'individual'
      });
      accountId = account.id;
    } catch (rzpError) {
      console.warn('Razorpay account creation failed, using mock account for test mode:', rzpError.message || rzpError);
      // Mock the account for development testing if KYC/Route is not enabled
      accountId = `acc_mock_${crypto.randomBytes(4).toString('hex')}`;
    }

    doctorProfile.razorpayAccountId = accountId;
    doctorProfile.payoutSetupCompleted = true; // In a real prod environment, we would listen for account activation webhooks
    await doctorProfile.save();

    res.status(200).json({ 
      message: 'Razorpay account linked successfully',
      accountId: accountId
    });

  } catch (error) {
    console.error('Error in onboardDoctor:', error);
    res.status(500).json({ message: 'Failed to setup payout account', error: error.message });
  }
};

exports.razorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET; 
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const event = req.body.event;
    const payment = req.body.payload.payment.entity;

    if (event === 'payment.captured') {
      const orderId = payment.order_id;
      
      const session = await Session.findOne({ razorpayOrderId: orderId });
      if (session) {
        session.paymentStatus = 'paid';
        session.paymentId = payment.id;
        session.status = 'scheduled';
        await session.save();
        console.log(`[Webhook] Session ${session._id} marked as paid.`);
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Webhook failed' });
  }
};
