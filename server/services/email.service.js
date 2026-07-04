/**
 * Email Service
 * Handles all email sending functionality via Resend
 */

const { Resend } = require('resend');
const { getEnv } = require('../config/environment');
const { getFrontendUrl } = require('../config/auth');
const { createLogger } = require('../utils/logger');

const logger = createLogger('EMAIL');

let resendClient = null;

function getResendClient() {
  if (!resendClient) {
    const apiKey = getEnv('RESEND');
    if (!apiKey) {
      logger.warn('RESEND API key not found. Email functionality disabled.');
      return null;
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

// In production, this MUST be a domain you have verified on Resend (e.g. noreply@yourdomain.com)
// For testing on a free Resend account without a verified domain, use 'onboarding@resend.dev'
// Note: 'onboarding@resend.dev' will ONLY send emails to the email address you signed up to Resend with!
const SENDER_EMAIL = 'Veraawell <support@veraawell.com>';

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(user, resetToken) {
  const resend = getResendClient();
  if (!resend) throw new Error('Email service not configured');

  const frontendBaseUrl = getFrontendUrl();
  const frontendResetUrl = `${frontendBaseUrl}/reset-password?token=${resetToken}`;

  try {
    const data = await resend.emails.send({
      from: SENDER_EMAIL,
      to: user.email,
      subject: 'Reset Your Veraawell Password',
      html: generatePasswordResetEmailHTML(user, frontendResetUrl)
    });
    logger.info('Password reset email sent', { email: user.email, id: data.id });
    return true;
  } catch (error) {
    logger.error('Failed to send password reset email via Resend', { error: error.message, email: user.email });
    throw error;
  }
}

/**
 * Send OTP verification email
 */
async function sendOTPEmail(email, otp, userType) {
  const resend = getResendClient();
  if (!resend) throw new Error('Email service not configured');

  try {
    const data = await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: 'Verify Your Veraawell Account - OTP Code',
      html: generateOTPEmailHTML(otp, userType)
    });
    logger.info('OTP email sent via Resend', { email, userType, id: data.id });
    return true;
  } catch (error) {
    logger.error('Failed to send OTP email via Resend', { error: error.message, email });
    throw error;
  }
}

/**
 * Generate password reset email HTML (Veraawell Brand)
 */
function generatePasswordResetEmailHTML(user, resetUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reset Your Password</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f9fafb; color: #1f2937; }
        .container { max-width: 600px; margin: 40px auto; padding: 32px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .logo-text { font-size: 28px; font-weight: 700; color: #0097b2; text-align: center; margin-bottom: 32px; letter-spacing: -0.5px; }
        .header { font-size: 24px; font-weight: 600; color: #111827; margin-bottom: 16px; text-align: center; }
        .message { color: #4b5563; margin-bottom: 24px; font-size: 16px; text-align: center; }
        .button-container { text-align: center; margin: 32px 0; }
        .button { display: inline-block; background-color: #0097b2; color: #ffffff; padding: 14px 40px; border-radius: 9999px; text-decoration: none; font-weight: 500; font-size: 16px; box-shadow: 0 4px 14px rgba(0, 151, 178, 0.3); }
        .expiry { font-size: 14px; color: #6b7280; margin-top: 16px; text-align: center; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 14px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-text">Veraawell</div>
        <h1 class="header">Reset Your Password</h1>
        <p class="message">Hi ${user.firstName},</p>
        <p class="message">We received a request to reset your password. Click the button below to securely set a new password.</p>
        <div class="button-container">
          <a href="${resetUrl}" class="button">Reset Password</a>
        </div>
        <p class="expiry">This link will expire in 1 hour for security reasons.</p>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veraawell. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate OTP email HTML (Veraawell Brand)
 */
function generateOTPEmailHTML(otp, userType) {
  const userTypeDisplay = userType === 'doctor' ? 'Professional' : 'Patient';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Account</title>
      <style>
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 0;
          background-color: #f0f9f9;
          color: #1f2937;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          padding: 40px 32px;
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 0 10px 25px -5px rgba(0, 151, 178, 0.05), 0 8px 10px -6px rgba(0, 151, 178, 0.01);
          border: 1px solid rgba(0, 151, 178, 0.1);
        }
        .logo-text {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 28px;
          color: #0097b2;
          text-align: center;
          margin-bottom: 32px;
        }
        .header {
          font-size: 24px;
          font-weight: 500;
          color: #111827;
          margin-bottom: 24px;
          text-align: center;
        }
        .message {
          color: #4b5563;
          margin-bottom: 20px;
          font-size: 16px;
          text-align: center;
        }
        .otp-container {
          background: rgba(0, 151, 178, 0.05);
          border: 1px solid rgba(0, 151, 178, 0.15);
          padding: 32px;
          border-radius: 20px;
          text-align: center;
          margin: 32px 0;
        }
        .otp-label {
          color: #007a90;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .otp-code {
          font-size: 48px;
          font-weight: 700;
          color: #0097b2;
          letter-spacing: 12px;
          font-family: 'Courier New', monospace;
          margin: 16px 0;
        }
        .info-box {
          margin-top: 32px;
          padding: 20px;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          font-size: 14px;
          color: #475569;
          text-align: center;
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #f1f5f9;
          text-align: center;
          font-size: 13px;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-text">Veerawell</div>
        <h1 class="header">Email Verification</h1>
        <p class="message">Welcome to Veerawell! You're registering as a <strong>${userTypeDisplay}</strong>.</p>
        <p class="message">Please use the secure verification code below to complete your signup:</p>
        
        <div class="otp-container">
          <div class="otp-label">Your Verification Code</div>
          <div class="otp-code">${otp}</div>
        </div>

        <div class="info-box">
          <strong>Security Tip:</strong> Never share this code with anyone. Veerawell staff will never ask for your OTP.
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veerawell. All rights reserved.</p>
          <p>Your mental health journey starts here.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send booking confirmation email
 */
async function sendBookingConfirmationEmail(email, sessionDetails) {
  const resend = getResendClient();
  if (!resend) return;

  try {
    const data = await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: 'Session Booking Confirmation - Veraawell',
      html: generateBookingConfirmationHTML(sessionDetails)
    });
    logger.info('Booking confirmation email sent', { email, id: data.id });
    return true;
  } catch (error) {
    logger.error('Failed to send booking confirmation email', { error: error.message, email });
  }
}

/**
 * Send session reminder email
 * @param {string} email - Patient email
 * @param {object} session - Session object populated with doctor info
 * @param {string} reminderType - '15min', 'start', or 'late'
 */
async function sendSessionReminderEmail(email, session, reminderType) {
  const resend = getResendClient();
  if (!resend) return;

  const doctorName = `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}`;
  let subject = '';
  
  if (reminderType === '15min') {
    subject = `Reminder: Your session with ${doctorName} starts in 15 minutes`;
  } else if (reminderType === 'start') {
    subject = `Your session with ${doctorName} is starting now!`;
  } else if (reminderType === 'late') {
    subject = `Action Required: Your session with ${doctorName} has already started`;
  }

  try {
    const data = await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: subject,
      html: generateSessionReminderHTML(session, reminderType, doctorName)
    });
    logger.info(`Session reminder email (${reminderType}) sent`, { email, id: data.id });
    return true;
  } catch (error) {
    logger.error(`Failed to send session reminder email (${reminderType})`, { error: error.message, email });
  }
}

/**
 * Send doctor approval email
 */
async function sendDoctorApprovedEmail(email, name) {
  const resend = getResendClient();
  if (!resend) return;

  const frontendLoginUrl = `${getFrontendUrl()}/auth`;

  try {
    const data = await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: 'Welcome to Veraawell! Your account is approved.',
      html: generateDoctorStatusHTML(name, 'approved', frontendLoginUrl)
    });
    logger.info('Doctor approval email sent', { email, id: data.id });
    return true;
  } catch (error) {
    logger.error('Failed to send doctor approval email', { error: error.message, email });
  }
}

/**
 * Send doctor rejection email
 */
async function sendDoctorRejectedEmail(email, name) {
  const resend = getResendClient();
  if (!resend) return;

  try {
    const data = await resend.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: 'Update regarding your Veraawell application',
      html: generateDoctorStatusHTML(name, 'rejected', null)
    });
    logger.info('Doctor rejection email sent', { email, id: data.id });
    return true;
  } catch (error) {
    logger.error('Failed to send doctor rejection email', { error: error.message, email });
  }
}

/**
 * Generate Booking Confirmation HTML
 */
function generateBookingConfirmationHTML(sessionDetails) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmed</title>
      <style>
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 0;
          background-color: #f0f9f9;
          color: #1f2937;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          padding: 40px 32px;
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 0 10px 25px -5px rgba(0, 151, 178, 0.05), 0 8px 10px -6px rgba(0, 151, 178, 0.01);
          border: 1px solid rgba(0, 151, 178, 0.1);
        }
        .logo-text {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 28px;
          color: #0097b2;
          text-align: center;
          margin-bottom: 32px;
        }
        .header {
          font-size: 24px;
          font-weight: 500;
          color: #111827;
          margin-bottom: 24px;
          text-align: center;
        }
        .message {
          color: #4b5563;
          margin-bottom: 20px;
          font-size: 16px;
          text-align: center;
        }
        .details-box {
          background: rgba(0, 151, 178, 0.05);
          border: 1px solid rgba(0, 151, 178, 0.15);
          padding: 28px;
          border-radius: 20px;
          margin: 32px 0;
        }
        .row { margin-bottom: 16px; font-size: 16px; display: flex; justify-content: space-between; }
        .row:last-child { margin-bottom: 0; }
        .label { font-weight: 500; color: #475569; }
        .value { font-weight: 600; color: #0097b2; }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #f1f5f9;
          text-align: center;
          font-size: 13px;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-text">Veerawell</div>
        <h1 class="header">Booking Confirmed</h1>
        <p class="message">Your session has been successfully booked. Here are your details:</p>
        <div class="details-box">
          <div class="row"><span class="label">Date:</span><span class="value">${sessionDetails.date}</span></div>
          <div class="row"><span class="label">Time:</span><span class="value">${sessionDetails.time}</span></div>
          <div class="row"><span class="label">Type:</span><span class="value">${sessionDetails.type}</span></div>
        </div>
        <p class="message" style="font-size: 14px;">You can join the call directly from your dashboard when the time comes.</p>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veerawell. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate Doctor Status HTML
 */
function generateDoctorStatusHTML(name, status, loginUrl) {
  const isApproved = status === 'approved';
  const color = isApproved ? '#0097b2' : '#f43f5e';
  const title = isApproved ? 'Application Approved' : 'Application Update';
  const msg = isApproved 
    ? 'Congratulations! Your professional account has been approved. You can now log in and start accepting sessions.'
    : 'We regret to inform you that we cannot approve your application at this time.';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 0;
          background-color: #f0f9f9;
          color: #1f2937;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          padding: 40px 32px;
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 0 10px 25px -5px rgba(0, 151, 178, 0.05), 0 8px 10px -6px rgba(0, 151, 178, 0.01);
          border: 1px solid rgba(0, 151, 178, 0.1);
        }
        .logo-text {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 28px;
          color: #0097b2;
          text-align: center;
          margin-bottom: 32px;
        }
        .header {
          font-size: 24px;
          font-weight: 500;
          color: #111827;
          margin-bottom: 24px;
          text-align: center;
        }
        .message {
          color: #4b5563;
          margin-bottom: 20px;
          font-size: 16px;
          text-align: center;
        }
        .button-container {
          text-align: center;
          margin: 32px 0;
        }
        .button {
          display: inline-block;
          background-color: ${color};
          color: #ffffff;
          padding: 14px 40px;
          border-radius: 9999px;
          text-decoration: none;
          font-weight: 600;
          font-size: 16px;
          box-shadow: 0 4px 14px rgba(0, 151, 178, 0.2);
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #f1f5f9;
          text-align: center;
          font-size: 13px;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-text">Veerawell</div>
        <h1 class="header" style="color: ${color};">${title}</h1>
        <p class="message">Dear ${name},</p>
        <p class="message">${msg}</p>
        ${isApproved ? `
        <div class="button-container">
          <a href="${loginUrl}" class="button">Log In Now</a>
        </div>
        ` : ''}
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veerawell. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate Session Reminder HTML
 */
function generateSessionReminderHTML(session, reminderType, doctorName) {
  const isLate = reminderType === 'late';
  const color = isLate ? '#f43f5e' : '#0097b2';
  const headerText = reminderType === '15min' ? 'Session Starting Soon' : 
                     reminderType === 'start' ? 'Session Starting Now' : 'Session Started';
  
  let messageHTML = '';
  if (reminderType === '15min') {
    messageHTML = `<p class="message">Hi ${session.patientId.firstName},</p>
                   <p class="message">Your therapy session with <strong>${doctorName}</strong> is starting in 15 minutes at ${session.sessionTime}. Please get ready and log in.</p>`;
  } else if (reminderType === 'start') {
    messageHTML = `<p class="message">Hi ${session.patientId.firstName},</p>
                   <p class="message">Your session with <strong>${doctorName}</strong> is starting in 2 minutes! Please join the call now.</p>`;
  } else if (reminderType === 'late') {
    messageHTML = `<p class="message">Hi ${session.patientId.firstName},</p>
                   <p class="message">Your session with <strong>${doctorName}</strong> has already started. Please join immediately to avoid having your session cancelled.</p>`;
  }

  const joinUrl = session.meetingLink || `${getFrontendUrl()}/patient-dashboard`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${headerText}</title>
      <style>
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 0;
          background-color: #f0f9f9;
          color: #1f2937;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          padding: 40px 32px;
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 0 10px 25px -5px rgba(0, 151, 178, 0.05), 0 8px 10px -6px rgba(0, 151, 178, 0.01);
          border: 1px solid rgba(0, 151, 178, 0.1);
        }
        .logo-text {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 28px;
          color: #0097b2;
          text-align: center;
          margin-bottom: 32px;
        }
        .header {
          font-size: 24px;
          font-weight: 500;
          color: ${color};
          margin-bottom: 24px;
          text-align: center;
        }
        .message {
          color: #4b5563;
          margin-bottom: 20px;
          font-size: 16px;
          text-align: center;
        }
        .button-container {
          text-align: center;
          margin: 32px 0;
        }
        .button {
          display: inline-block;
          background-color: ${color};
          color: #ffffff;
          padding: 14px 40px;
          border-radius: 9999px;
          text-decoration: none;
          font-weight: 600;
          font-size: 16px;
          box-shadow: 0 4px 14px rgba(0, 151, 178, 0.2);
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #f1f5f9;
          text-align: center;
          font-size: 13px;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-text">Veerawell</div>
        <h1 class="header">${headerText}</h1>
        ${messageHTML}
        <div class="button-container">
          <a href="${joinUrl}" class="button">Join Session</a>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veerawell. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  sendPasswordResetEmail,
  sendOTPEmail,
  sendBookingConfirmationEmail,
  sendDoctorApprovedEmail,
  sendDoctorRejectedEmail,
  sendSessionReminderEmail
};
