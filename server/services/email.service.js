/**
 * Email Service
 * Handles all email sending functionality
 */

const nodemailer = require('nodemailer');
const { getEnv, isProduction } = require('../config/environment');
const { getFrontendUrl } = require('../config/auth');
const { createLogger } = require('../utils/logger');

const logger = createLogger('EMAIL');

let transporter = null;

/**
 * Initialize email transporter
 */
function initializeTransporter() {
  const emailUser = getEnv('EMAIL_USER');
  const emailPass = getEnv('EMAIL_PASS');

  if (!emailUser || !emailPass) {
    logger.warn('Email credentials not configured. Email functionality will be disabled.');
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });

  logger.info('Email transporter initialized');
  return transporter;
}

/**
 * Get email transporter (lazy initialization)
 */
function getTransporter() {
  if (!transporter) {
    return initializeTransporter();
  }
  return transporter;
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(user, resetToken) {
  const emailTransporter = getTransporter();

  if (!emailTransporter) {
    throw new Error('Email service not configured');
  }

  const frontendBaseUrl = getFrontendUrl();
  const frontendResetUrl = `${frontendBaseUrl}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: `Veraawell <${getEnv('EMAIL_USER')}>`,
    to: user.email,
    subject: 'Reset Your Veraawell Password',
    html: generatePasswordResetEmailHTML(user, frontendResetUrl)
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    logger.info('Password reset email sent', { email: user.email });
    return true;
  } catch (error) {
    logger.error('Failed to send password reset email', { error: error.message, email: user.email });
    throw error;
  }
}

/**
 * Generate password reset email HTML
 */
function generatePasswordResetEmailHTML(user, resetUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 0;
          background-color: #f9fafb;
          color: #1f2937;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          padding: 32px;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .logo-text {
          font-size: 24px;
          font-weight: 700;
          color: #10b981;
          text-align: center;
          margin-bottom: 32px;
        }
        .header {
          font-size: 24px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 16px;
          text-align: center;
        }
        .message {
          color: #4b5563;
          margin-bottom: 24px;
          font-size: 16px;
        }
        .button-container {
          text-align: center;
          margin: 32px 0;
        }
        .button {
          display: inline-block;
          background-color: #10b981;
          color: #ffffff;
          padding: 12px 32px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
          font-size: 16px;
        }
        .expiry {
          font-size: 14px;
          color: #6b7280;
          margin-top: 16px;
          text-align: center;
        }
        .warning {
          margin-top: 32px;
          padding: 16px;
          background-color: #fef2f2;
          border-radius: 8px;
          color: #991b1b;
          font-size: 14px;
        }
        .footer {
          margin-top: 32px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 14px;
          color: #6b7280;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-text">Veraawell</div>
        <h1 class="header">Reset Your Password</h1>
        <p class="message">Hi ${user.firstName},</p>
        <p class="message">
          We received a request to reset your password for your Veraawell account. 
          Click the button below to set a new password.
        </p>
        <div class="button-container">
          <a href="${resetUrl}" class="button">Reset Password</a>
        </div>
        <p class="expiry">This link will expire in 1 hour for security reasons.</p>
        <div class="warning">
          If you didn't request this password reset, you can safely ignore this email. 
          Your account security is important to us, so please contact support if you have any concerns.
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veraawell. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send OTP verification email
 */
async function sendOTPEmail(email, otp, userType) {
  const emailTransporter = getTransporter();

  if (!emailTransporter) {
    throw new Error('Email service not configured');
  }

  const mailOptions = {
    from: `Veraawell <${getEnv('EMAIL_USER')}>`,
    to: email,
    subject: 'Verify Your Veraawell Account - OTP Code',
    html: generateOTPEmailHTML(otp, userType)
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    logger.info('OTP email sent', { email, userType });
    return true;
  } catch (error) {
    logger.error('Failed to send OTP email', { error: error.message, email });
    throw error;
  }
}

/**
 * Generate OTP email HTML
 */
function generateOTPEmailHTML(otp, userType) {
  const userTypeDisplay = userType === 'doctor' ? 'Doctor' : 'Patient';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Account</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 0;
          background-color: #f9fafb;
          color: #1f2937;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          padding: 32px;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .logo-text {
          font-size: 28px;
          font-weight: 700;
          color: #10b981;
          text-align: center;
          margin-bottom: 32px;
        }
        .header {
          font-size: 24px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 16px;
          text-align: center;
        }
        .message {
          color: #4b5563;
          margin-bottom: 24px;
          font-size: 16px;
          text-align: center;
        }
        .otp-container {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          padding: 32px;
          border-radius: 12px;
          text-align: center;
          margin: 32px 0;
        }
        .otp-label {
          color: #ffffff;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .otp-code {
          font-size: 48px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 8px;
          font-family: 'Courier New', monospace;
          margin: 16px 0;
        }
        .expiry {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
          margin-top: 12px;
        }
        .security-notice {
          margin-top: 32px;
          padding: 16px;
          background-color: #fef2f2;
          border-left: 4px solid #ef4444;
          border-radius: 8px;
          font-size: 14px;
          color: #991b1b;
        }
        .info-box {
          margin-top: 24px;
          padding: 16px;
          background-color: #eff6ff;
          border-left: 4px solid #3b82f6;
          border-radius: 8px;
          font-size: 14px;
          color: #1e40af;
        }
        .footer {
          margin-top: 32px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 14px;
          color: #6b7280;
        }
        .footer a {
          color: #10b981;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-text">Veraawell</div>
        <h1 class="header">Email Verification</h1>
        <p class="message">
          Welcome to Veraawell! You're registering as a <strong>${userTypeDisplay}</strong>.
        </p>
        <p class="message">
          Please use the verification code below to complete your signup:
        </p>
        
        <div class="otp-container">
          <div class="otp-label">Your Verification Code</div>
          <div class="otp-code">${otp}</div>
          <div class="expiry">Valid for 5 minutes</div>
        </div>

        <div class="info-box">
          <strong> Security Tip:</strong> Never share this code with anyone. Veraawell staff will never ask for your OTP.
        </div>
        
        <div class="security-notice">
          <strong> Didn't request this?</strong><br>
          If you didn't attempt to sign up for Veraawell, please ignore this email and your account will not be created.
          For security concerns, contact our support team immediately.
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veraawell. All rights reserved.</p>
          <p>Your mental health journey starts here. Professional therapy and support.</p>
          <p style="margin-top: 12px;">
            <a href="mailto:support@veraawell.com">Contact Support</a>
          </p>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 12px;">
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  initializeTransporter,
  getTransporter,
  sendPasswordResetEmail,
  sendOTPEmail
};
