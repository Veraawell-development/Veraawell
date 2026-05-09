/**
 * OTP Controller
 * Handles OTP generation, verification, and resend — all logic already uses logger
 */

const OTP = require('../models/otp');
const { generateOTP, hashOTP, verifyOTP, getExpiryTime } = require('../utils/otpGenerator');
const { sendOTPEmail } = require('../services/email.service');
const { createLogger } = require('../utils/logger');

const logger = createLogger('OTP-CTRL');

/** POST /api/otp/send — Send OTP to email */
const sendOtp = async (req, res) => {
  try {
    const { email, userType } = req.body;
    if (!email || !userType) return res.status(400).json({ success: false, message: 'Email and user type are required' });
    if (!['patient', 'doctor'].includes(userType)) return res.status(400).json({ success: false, message: 'Invalid user type. Must be patient or doctor' });

    await OTP.cleanupOldOTPs(email);

    const recentOTP = await OTP.findOne({ email, verified: false, expiresAt: { $gt: new Date() }, createdAt: { $gt: new Date(Date.now() - 60000) } });
    if (recentOTP) return res.status(429).json({ success: false, message: 'An OTP was recently sent. Please wait 1 minute before requesting again.', expiresAt: recentOTP.expiresAt });

    const otp = generateOTP();
    const hashedOTP = await hashOTP(otp);
    const otpRecord = new OTP({ email: email.toLowerCase(), otp: hashedOTP, purpose: 'signup', userType, expiresAt: getExpiryTime() });
    await otpRecord.save();
    logger.info('OTP generated and saved', { email, userType });

    // Send email in background to prevent request timeout on Render
    sendOTPEmail(email, otp, userType).catch(emailError => {
      logger.error('Failed to send OTP email in background', { error: emailError.message, email });
    });
    
    logger.info('OTP email triggered in background', { email });
    res.json({ success: true, message: 'OTP sent to your email', expiresAt: otpRecord.expiresAt, email });
  } catch (error) {
    logger.error('Error in OTP send', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
};

/** POST /api/otp/verify — Verify an OTP code */
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    if (otp.length !== 6 || !/^\d+$/.test(otp)) return res.status(400).json({ success: false, message: 'OTP must be a 6-digit number' });

    const otpRecord = await OTP.findOne({ email: email.toLowerCase(), verified: false }).sort({ createdAt: -1 });
    if (!otpRecord) return res.status(404).json({ success: false, message: 'No OTP found for this email. Please request a new one.' });
    if (otpRecord.isExpired()) return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.', expired: true });
    if (otpRecord.maxAttemptsReached()) return res.status(429).json({ success: false, message: 'Maximum verification attempts exceeded. Please request a new OTP.', maxAttemptsReached: true });

    const isValid = await verifyOTP(otp, otpRecord.otp);
    if (!isValid) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      const attemptsLeft = 3 - otpRecord.attempts;
      logger.warn('Invalid OTP attempt', { email, attempts: otpRecord.attempts });
      return res.status(400).json({ success: false, message: `Invalid OTP. ${attemptsLeft} attempt(s) remaining.`, attemptsLeft });
    }

    otpRecord.verified = true;
    await otpRecord.save();
    logger.info('OTP verified', { email });
    res.json({ success: true, message: 'Email verified successfully', verified: true });
  } catch (error) {
    logger.error('Error in OTP verify', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to verify OTP. Please try again.' });
  }
};

/** POST /api/otp/resend — Resend OTP */
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const existingOTP = await OTP.findOne({ email: email.toLowerCase(), verified: false, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!existingOTP) return res.status(404).json({ success: false, message: 'No active OTP found. Please request a new one.' });
    if (existingOTP.resendCount >= 3) return res.status(429).json({ success: false, message: 'Maximum resend limit reached. Please request a new OTP.' });

    const newOTP = generateOTP();
    const hashedOTP = await hashOTP(newOTP);
    existingOTP.otp = hashedOTP;
    existingOTP.attempts = 0;
    existingOTP.resendCount += 1;
    existingOTP.expiresAt = getExpiryTime();
    await existingOTP.save();

    // Send email in background to prevent request timeout on Render
    sendOTPEmail(email, newOTP, existingOTP.userType).catch(emailError => {
      logger.error('Failed to resend OTP email in background', { error: emailError.message, email });
    });
    
    logger.info('OTP email triggered in background', { email, resendCount: existingOTP.resendCount });
    res.json({ success: true, message: 'OTP resent to your email', expiresAt: existingOTP.expiresAt, resendsLeft: 3 - existingOTP.resendCount });
  } catch (error) {
    logger.error('Error in OTP resend', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again.' });
  }
};

module.exports = { sendOtp, verifyOtp, resendOtp };
