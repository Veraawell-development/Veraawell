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

module.exports = {
  initializeTransporter,
  getTransporter,
  sendPasswordResetEmail
};
