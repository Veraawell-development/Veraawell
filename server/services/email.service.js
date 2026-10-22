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
const REPLY_TO = 'support@veraawell.com';

/**
 * The plain-text part, from the HTML: some mail apps show only text, and a
 * mail without one scores worse with spam filters.
 */
function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<(br|\/p|\/div|\/h1|\/h2|\/li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

const { inr } = require('../utils/money');

/**
 * The one place an email leaves this process.
 *
 * Resend 4.x never throws: `emails.send` resolves to `{ data, error }` for
 * every outcome, including a rejected API key, an unverified sender domain
 * and a network failure. Every send in this file used to be wrapped in a
 * try/catch that therefore could not fire, and logged "sent" with
 * `id: data.id` — reading `id` off the `{ data, error }` envelope, which is
 * always undefined. So a broken mail configuration looked, in the logs,
 * exactly like a working one, and a signup whose OTP never left reported
 * success to the user.
 *
 * This turns `error` into a throw and logs the real message id. Callers
 * decide what a failure means: see `sendBestEffort` below.
 */
async function deliver(label, { to, subject, html }) {
  const resend = getResendClient();
  if (!resend) {
    const err = new Error('Email service not configured');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  const { data, error } = await resend.emails.send({ from: SENDER_EMAIL, replyTo: REPLY_TO, to, subject, html, text: htmlToText(html) });
  if (error) {
    const err = new Error(`Email provider refused the ${label} email: ${error.message || error.name || 'unknown error'}`);
    err.code = 'EMAIL_DELIVERY_FAILED';
    logger.error(`Failed to send ${label} email`, { to, error: err.message });
    throw err;
  }

  logger.info(`${label} email sent`, { to, id: data && data.id });
  return data;
}

/**
 * For notifications that follow a write that has already committed — a
 * booking, a cancellation, an approval. The write is the outcome; failing the
 * request over its courtesy email would tell the user the action failed when
 * it did not, and invite a retry that does it twice. Failures are logged (for
 * real, now, by deliver) and swallowed. Returns the provider's data, or null.
 */
async function sendBestEffort(label, message) {
  // Unconfigured is the normal state in development and in tests; the
  // warning getResendClient() logs once is enough.
  if (!getResendClient()) return null;
  try {
    return await deliver(label, message);
  } catch (error) {
    return null;
  }
}

/**
 * Everything interpolated into email HTML that a person typed — names,
 * cancellation messages, rejection reasons — goes through this. A first name
 * of `<a href=...>` used to render as a working link inside a mail that
 * arrives from support@veraawell.com, which is a phishing kit with our
 * domain's reputation attached.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const e = escapeHtml;

/**
 * Template values are optional. Callers do not always have every field — a
 * session populated without its doctor, a booking path that never computed
 * earnings — and the templates used to interpolate whatever arrived, so
 * doctors received "Hi Dr. undefined", "undefined minutes" and "₹undefined".
 * A missing value now drops its row (or its clause) instead of printing.
 */
function present(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value).trim() !== '';
}

/** One label/value row, or nothing when the value is missing. */
function row(label, value, { prefix = '', suffix = '', valueStyle = '', rowStyle = '' } = {}) {
  if (!present(value)) return '';
  const rowAttr = rowStyle ? ` style="${rowStyle}"` : '';
  const valueAttr = valueStyle ? ` style="${valueStyle}"` : '';
  return `<div class="row"${rowAttr}><span class="label">${e(label)}</span><span class="value"${valueAttr}>${e(prefix)}${e(value)}${e(suffix)}</span></div>`;
}

/** A details box, or nothing when every row in it was dropped. */
function box(rows, className = 'box') {
  const body = rows.filter(Boolean).join('');
  return body ? `<div class="${className}">${body}</div>` : '';
}

/** "Hi Dr. Rao," — or just "Hi," when there is no name to use. */
function greeting(name, title = '') {
  return present(name) ? `Hi ${title}${e(name)},` : 'Hi,';
}

/** "First Last" from whichever parts exist; '' when neither does. */
function fullName(first, last) {
  return [first, last].filter(present).map((v) => String(v).trim()).join(' ');
}

/**
 * Send password reset email. Throws on failure; the caller decides whether
 * to surface it.
 */
async function sendPasswordResetEmail(user, resetToken) {
  const frontendBaseUrl = getFrontendUrl();
  const frontendResetUrl = `${frontendBaseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  return deliver('password reset', {
    to: user.email,
    subject: 'Reset Your Veraawell Password',
    html: generatePasswordResetEmailHTML(user, frontendResetUrl)
  });
}

/**
 * Send OTP verification email. Critical: without it the account cannot be
 * verified, so a failure must reach the person waiting for the code.
 */
async function sendOTPEmail(email, otp, userType) {
  return deliver('signup OTP', {
    to: email,
    subject: 'Verify Your Veraawell Account - OTP Code',
    html: generateOTPEmailHTML(otp, userType)
  });
}

/**
 * Admin password reset link. Throws, like the user one.
 *
 * Admin mail used to go through its own nodemailer/Gmail transport in
 * routes/admin/auth.js, configured by EMAIL_USER/EMAIL_PASS — variables
 * production does not require — so admin password reset quietly depended on
 * credentials nobody had to set. It goes through the same provider as
 * everything else now.
 */
async function sendAdminPasswordResetEmail(admin, resetUrl) {
  return deliver('admin password reset', {
    to: admin.email,
    subject: 'Admin Password Reset Request',
    html: generateAdminPasswordResetHTML(admin, resetUrl)
  });
}

/**
 * Credentials for an admin a super admin just created. Critical: the account
 * is unusable without them.
 */
async function sendAdminCredentialsEmail(email, tempPassword) {
  return deliver('admin credentials', {
    to: email,
    subject: 'Your Veraawell Admin Account',
    html: wrap(`
      <h1 class="header">Your Admin Account Has Been Created</h1>
      <div class="box">
        <div class="row"><span class="label">Email</span><span class="value">${e(email)}</span></div>
        <div class="row"><span class="label">Temporary password</span><span class="value" style="font-family:monospace">${e(tempPassword)}</span></div>
      </div>
      <p class="body-text">Please change your password when you first sign in.</p>
      <div class="btn-wrap"><a href="${e(getFrontendUrl())}/admin-login" class="btn">Sign in</a></div>
    `)
  });
}

function generateAdminPasswordResetHTML(admin, resetUrl) {
  return `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a1a; margin-bottom: 10px;">Password Reset Request</h1>
            <p style="color: #666; margin-bottom: 20px;">Admin Portal - VeraAwell</p>
          </div>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin-bottom: 20px; color: #333;">Hello ${e(admin.firstName)},</p>
            <p style="margin-bottom: 20px; color: #333;">We received a request to reset your admin account password. Click the button below to proceed:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${e(resetUrl)}" style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #666; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email or contact support if you're concerned.</p>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px;">
            <p>VeraAwell Admin System</p>
            <p>This is a secure system email. Please do not reply.</p>
          </div>
        </div>
      `;
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
        <p class="message">Hi ${e(user.firstName)},</p>
        <p class="message">We received a request to reset your password. Click the button below to securely set a new password.</p>
        <div class="button-container">
          <a href="${e(resetUrl)}" class="button">Reset Password</a>
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
  const userTypeDisplay = userType === 'doctor' ? 'Professional' : userType === 'admin' ? 'Admin' : 'Patient';

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
        <div class="logo-text">Veraawell</div>
        <h1 class="header">Email Verification</h1>
        <p class="message">Welcome to Veraawell! You're registering as a <strong>${userTypeDisplay}</strong>.</p>
        <p class="message">Please use the secure verification code below to complete your signup:</p>
        
        <div class="otp-container">
          <div class="otp-label">Your Verification Code</div>
          <div class="otp-code">${e(otp)}</div>
        </div>

        <p class="message" style="font-size:14px">This code works for 15 minutes.</p>
        <div class="info-box">
          <strong>Security Tip:</strong> Never share this code with anyone. Veraawell staff will never ask for your OTP.
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veraawell. All rights reserved.</p>
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
  return sendBestEffort('booking confirmation', {
    to: email,
    subject: 'Session Booking Confirmation - Veraawell',
    html: generateBookingConfirmationHTML(sessionDetails)
  });
}

/**
 * Send session reminder email
 * @param {string} email - the recipient
 * @param {object} session - Session populated with patient and doctor names
 * @param {string} reminderType - '15min', 'start', or 'late' (patients only)
 * @param {{ recipient?: 'patient'|'doctor' }} [options]
 */
async function sendSessionReminderEmail(email, session, reminderType, { recipient = 'patient' } = {}) {
  const doctor = session.doctorId || {};
  const patient = session.patientId || {};
  const named = fullName(doctor.firstName, doctor.lastName);
  const doctorName = named ? `Dr. ${named}` : 'your therapist';
  const patientName = fullName(patient.firstName, patient.lastName) || 'your patient';
  // Who the session is "with", from the reader's side.
  const other = recipient === 'doctor' ? patientName : doctorName;
  let subject = '';

  if (reminderType === '15min') {
    subject = `Reminder: Your session with ${other} starts in 15 minutes`;
  } else if (reminderType === 'start') {
    subject = `Your session with ${other} is starting now!`;
  } else if (reminderType === 'late') {
    subject = `Your session with ${other} has started — please join`;
  }

  return sendBestEffort(`session reminder (${recipient}, ${reminderType})`, {
    to: email,
    subject,
    html: generateSessionReminderHTML(session, reminderType, other, recipient)
  });
}

/**
 * Send doctor approval email
 */
async function sendDoctorApprovedEmail(email, name) {
  // /login, not /auth — there is no /auth route, so the button in this email
  // landed every newly approved doctor on the 404 page.
  const frontendLoginUrl = `${getFrontendUrl()}/login`;
  return sendBestEffort('doctor approval', {
    to: email,
    subject: 'Welcome to Veraawell! Your account is approved.',
    html: generateDoctorStatusHTML(name, 'approved', frontendLoginUrl, {
      approvedMessage: 'Congratulations! Your professional account has been approved, and you can now sign in.',
      setupSteps: true
    })
  });
}

/**
 * Send doctor rejection email
 */
async function sendDoctorRejectedEmail(email, name, reason) {
  return sendBestEffort('doctor rejection', {
    to: email,
    subject: 'Update regarding your Veraawell application',
    html: generateDoctorStatusHTML(name, 'rejected', null, { reason })
  });
}

/**
 * The outcome of an admin's signup request. Doctors were told; admins were
 * not, so a pending admin had no way to learn they could now sign in.
 */
async function sendAdminDecisionEmail(email, name, approved, reason) {
  return sendBestEffort(approved ? 'admin approval' : 'admin rejection', {
    to: email,
    subject: approved ? 'Your Veraawell admin access is approved' : 'Update on your Veraawell admin request',
    html: generateDoctorStatusHTML(name, approved ? 'approved' : 'rejected', `${getFrontendUrl()}/admin-login`, {
      reason,
      approvedMessage: 'Your admin account has been approved. You can now sign in to the admin dashboard.',
      rejectedMessage: 'Your request for admin access was not approved.'
    })
  });
}

/**
 * Generate Booking Confirmation HTML
 */
function generateBookingConfirmationHTML(sessionDetails = {}) {
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
        <div class="logo-text">Veraawell</div>
        <h1 class="header">Booking Confirmed</h1>
        <p class="message">Your session is booked. Here are the details:</p>
        ${box([
          row('Therapist:', sessionDetails.doctorName),
          row('Date:', sessionDetails.date),
          row('Time:', sessionDetails.time),
          row('Duration:', sessionDetails.duration, { suffix: ' minutes' }),
          row('Session:', sessionDetails.mode),
          row('Amount paid:', present(sessionDetails.price) && Number(sessionDetails.price) > 0 ? inr(sessionDetails.price) : null)
        ], 'details-box')}
        <p class="message" style="font-size: 14px;">You can join from 15 minutes before the start, from your dashboard. Please add an emergency contact before then if you haven't yet.</p>
        <div style="text-align:center;margin:28px 0"><a href="${e(getFrontendUrl())}/patient-dashboard" style="display:inline-block;background:#0097b2;color:#fff;padding:13px 36px;border-radius:9999px;text-decoration:none;font-weight:600">Go to your dashboard</a></div>
        <p class="message" style="font-size: 13px; color:#94a3b8">Need to cancel? Cancel at least 4 hours before the start for a full refund.</p>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veraawell. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate Doctor Status HTML
 */
function generateDoctorStatusHTML(name, status, loginUrl, options = {}) {
  const isApproved = status === 'approved';
  const color = isApproved ? '#0097b2' : '#f43f5e';
  const title = isApproved ? 'Application Approved' : 'Application Update';
  const msg = isApproved
    ? (options.approvedMessage || 'Congratulations! Your professional account has been approved. You can now log in and start accepting sessions.')
    : (options.rejectedMessage || 'We regret to inform you that we cannot approve your application at this time.');
  // What an approved therapist does next. It said "start accepting
  // sessions", but nobody can book them until all three are done
  // (services/bookability.js) — and nothing told them so.
  const stepsLine = isApproved && options.setupSteps
    ? `<p class="message">Before patients can find and book you:</p>
       <ol class="message" style="padding-left:20px;margin:0 0 16px">
         <li>Complete your profile and set prices for all six sessions.</li>
         <li>Add your bank details — Veraawell checks them before your first booking.</li>
         <li>Choose your weekly times in Manage Calendar.</li>
       </ol>
       <p class="message">Your dashboard shows what is still missing.</p>`
    : '';
  // The reason the admin typed was recorded and never sent.
  const reasonLine = !isApproved && present(options.reason)
    ? `<p class="message"><strong>Reason:</strong> ${e(options.reason)}</p>`
    : '';

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
        <div class="logo-text">Veraawell</div>
        <h1 class="header" style="color: ${color};">${title}</h1>
        <p class="message">${present(name) ? `Dear ${e(name)},` : 'Hello,'}</p>
        <p class="message">${msg}</p>
        ${stepsLine}
        ${reasonLine}
        ${isApproved ? `
        <div class="button-container">
          <a href="${e(loginUrl)}" class="button">Log In Now</a>
        </div>
        ` : ''}
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veraawell. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate Session Reminder HTML
 */
function generateSessionReminderHTML(session, reminderType, doctorName, recipient = 'patient') {
  const isLate = reminderType === 'late';
  const color = isLate ? '#f43f5e' : '#0097b2';
  const headerText = reminderType === '15min' ? 'Session Starting Soon' : 
                     reminderType === 'start' ? 'Session Starting Now' : 'Session Started';
  
  const reader = recipient === 'doctor' ? (session.doctorId || {}) : (session.patientId || {});
  const hi = greeting(reader.firstName, recipient === 'doctor' ? 'Dr. ' : '');
  const doctor = e(doctorName);
  // The session's own time, in IST and labelled as such.
  const when = require('./sessionTime').displayWhen(session).time || session.sessionTime;
  const at = present(when) ? ` at ${e(when)}` : '';
  let messageHTML = '';
  if (reminderType === '15min') {
    messageHTML = `<p class="message">${hi}</p>
                   <p class="message">Your therapy session with <strong>${doctor}</strong> is starting in 15 minutes${at}. Please get ready and log in.</p>`;
  } else if (reminderType === 'start') {
    messageHTML = `<p class="message">${hi}</p>
                   <p class="message">Your session with <strong>${doctor}</strong> is starting in 2 minutes! Please join the call now.</p>`;
  } else if (reminderType === 'late') {
    messageHTML = `<p class="message">${hi}</p>
                   <p class="message">Your session with <strong>${doctor}</strong> has already started. Please join now — if you haven't joined within 10 minutes of the start, the session counts as missed.</p>`;
  }

  // The session's own call page, as a full address. This used to be
  // meetingLink — a relative path, which doesn't open from a mail client,
  // and for booked sessions a random one that was never a page at all.
  const joinUrl = session._id ? `${getFrontendUrl()}/video-call/${session._id}` : `${getFrontendUrl()}/${recipient === 'doctor' ? 'doctor' : 'patient'}-dashboard`;

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
        <div class="logo-text">Veraawell</div>
        <h1 class="header">${headerText}</h1>
        ${messageHTML}
        <div class="button-container">
          <a href="${e(joinUrl)}" class="button">Join Session</a>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Veraawell. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send new booking notification to doctor
 */
async function sendDoctorNewBookingEmail(email, details) {
  return sendBestEffort('doctor new booking', {
    to: email,
    subject: ['New Session Booked', present(details.patientName) && `with ${details.patientName}`, present(details.date) && `on ${details.date}`]
      .filter(Boolean).join(' '),
    html: generateDoctorNewBookingHTML(details)
  });
}

/**
 * Send payment failed email to patient
 */
async function sendPaymentFailedEmail(email, details) {
  return sendBestEffort('payment failed', {
    to: email,
    subject: 'Payment Failed — Please Try Again | Veraawell',
    html: generatePaymentFailedHTML(details)
  });
}

/**
 * Send cancellation email (to either patient or doctor)
 */
async function sendCancellationEmail(email, details) {
  return sendBestEffort('cancellation', {
    to: email,
    subject: `Session Cancelled${present(details.date) ? ` — ${details.date}` : ''} | Veraawell`,
    html: generateCancellationHTML(details)
  });
}

/**
 * Send refund initiated email to patient
 */
async function sendRefundInitiatedEmail(email, details) {
  return sendBestEffort('refund initiated', {
    to: email,
    subject: `Refund Initiated${present(details.amount) ? ` — ${inr(details.amount)}` : ''} | Veraawell`,
    html: generateRefundHTML(details, 'initiated')
  });
}

/**
 * Send refund confirmed email to patient
 */
async function sendRefundConfirmedEmail(email, details) {
  return sendBestEffort('refund confirmed', {
    to: email,
    subject: present(details.amount)
      ? `Refund Confirmed — ${inr(details.amount)} is on its way | Veraawell`
      : 'Refund Confirmed — it is on its way | Veraawell',
    html: generateRefundHTML(details, 'confirmed')
  });
}

/**
 * Send doctor session earnings summary after session completes
 */
async function sendDoctorSessionSummaryEmail(email, details) {
  return sendBestEffort('doctor session summary', {
    to: email,
    subject: present(details.earnings)
      ? `Session Complete — ${inr(details.earnings)} earned | Veraawell`
      : 'Session Complete | Veraawell',
    html: generateDoctorSessionSummaryHTML(details)
  });
}

/**
 * What became of a session — a no-show, a refund for an absent therapist, a
 * late cancellation (services/sessionOutcomes.js decides the words). One
 * template, because these differ only in their text.
 *
 * @param {string} email
 * @param {{ subject: string, title: string, recipientName?: string, doctor?: boolean,
 *           paragraphs: string[], when?: string, amountLabel?: string, amount?: number }} details
 */
async function sendSessionOutcomeEmail(email, details) {
  return sendBestEffort('session outcome', {
    to: email,
    subject: `${details.subject} | Veraawell`,
    html: generateSessionOutcomeHTML(details)
  });
}

/**
 * A short notice in the standard layout: a title, a few paragraphs, optional
 * detail rows and a button. For the messages that differ only in words
 * (instant-request notices, refund delays, payouts, account deletion).
 *
 * @param {string} email
 * @param {{ subject: string, title: string, recipientName?: string, doctor?: boolean,
 *           paragraphs: string[], when?: string, rows?: [string, string][],
 *           amountLabel?: string, amount?: number, path?: string, buttonLabel?: string,
 *           noButton?: boolean }} details
 * @param {string} [label] for the log
 */
async function sendNoticeEmail(email, details, label = 'notice') {
  return sendBestEffort(label, {
    to: email,
    subject: `${details.subject} | Veraawell`,
    html: generateSessionOutcomeHTML(details)
  });
}

/**
 * Something an admin must look at (a refund the gateway refused, a new
 * doctor application, bank details to check). To ADMIN_ALERT_EMAIL, else the
 * support inbox.
 */
async function sendAdminAlertEmail(subject, paragraphs, { rows = [], path = 'super-admin-dashboard' } = {}) {
  const to = getEnv('ADMIN_ALERT_EMAIL', 'support@veraawell.com');
  return sendNoticeEmail(to, {
    subject: `[Admin] ${subject}`,
    title: subject,
    paragraphs,
    rows,
    path,
    buttonLabel: 'Open the admin console'
  }, 'admin alert');
}

/**
 * Send payout account activated email to doctor
 */
async function sendPayoutActivatedEmail(email, name) {
  return sendBestEffort('payout activated', {
    to: email,
    subject: 'Your bank details are approved | Veraawell',
    html: generatePayoutStatusHTML(name, 'active', '')
  });
}

/**
 * Send payout onboarding rejected email to doctor
 */
async function sendPayoutOnboardingRejectedEmail(email, name, reason) {
  return sendBestEffort('payout onboarding rejected', {
    to: email,
    subject: 'Action Required: Payout Setup Issue | Veraawell',
    html: generatePayoutStatusHTML(name, 'rejected', reason)
  });
}

// ─────────────────────────────────────────────────────────────
// HTML GENERATORS FOR NEW EMAIL TYPES
// ─────────────────────────────────────────────────────────────

const BASE_STYLES = `
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f0f9f9; color: #1f2937; }
  .container { max-width: 600px; margin: 40px auto; padding: 40px 32px; background: #ffffff; border-radius: 24px; box-shadow: 0 10px 25px -5px rgba(0,151,178,0.05); border: 1px solid rgba(0,151,178,0.1); }
  .logo { font-family: Georgia, serif; font-size: 28px; color: #0097b2; text-align: center; margin-bottom: 32px; }
  .header { font-size: 22px; font-weight: 600; color: #111827; text-align: center; margin-bottom: 20px; }
  .body-text { color: #4b5563; font-size: 15px; text-align: center; margin-bottom: 16px; }
  .box { background: rgba(0,151,178,0.05); border: 1px solid rgba(0,151,178,0.15); padding: 24px 28px; border-radius: 16px; margin: 24px 0; }
  .row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 12px; }
  .row:last-child { margin-bottom: 0; }
  .label { color: #6b7280; font-weight: 500; }
  .value { color: #0097b2; font-weight: 600; }
  .btn-wrap { text-align: center; margin: 28px 0; }
  .btn { display: inline-block; background: #0097b2; color: #fff; padding: 13px 36px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 15px; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; }
`;

function wrap(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_STYLES}</style></head><body><div class="container"><div class="logo">Veraawell</div>${body}<div class="footer"><p>© ${new Date().getFullYear()} Veraawell. All rights reserved.</p><p>Your mental health journey starts here.</p></div></div></body></html>`;
}

function generateDoctorNewBookingHTML(d = {}) {
  return wrap(`
    <h1 class="header">📅 New Session Booked</h1>
    <p class="body-text">${greeting(d.doctorName, 'Dr. ')}</p>
    <p class="body-text">A patient has successfully booked a session with you. Please be ready at the scheduled time.</p>
    ${box([
      row('Patient', d.patientName),
      row('Date', d.date),
      row('Time', d.time),
      row('Duration', d.duration, { suffix: ' minutes' }),
      row('Session Type', d.type),
      row('Your Earnings', present(d.doctorEarnings) ? inr(d.doctorEarnings) : null)
    ])}
    <div class="btn-wrap"><a href="${e(getFrontendUrl())}/doctor-dashboard" class="btn">Go to Dashboard</a></div>
  `);
}

function generatePaymentFailedHTML(d = {}) {
  return wrap(`
    <h1 class="header" style="color:#ef4444">❌ Payment Failed</h1>
    <p class="body-text">${greeting(d.patientName)}</p>
    <p class="body-text">Your payment didn't go through, so the booking wasn't confirmed and the time slot has been released.</p>
    ${box([
      row('Therapist', present(d.doctorName) ? `Dr. ${d.doctorName}` : null),
      row('Amount', present(d.amount) ? inr(d.amount) : null)
    ])}
    <p class="body-text">If money did leave your account, it is refunded automatically within 5–7 working days. You can book again any time.</p>
    <div class="btn-wrap"><a href="${e(getFrontendUrl())}/patient-dashboard" class="btn">Try Again</a></div>
  `);
}

/**
 * d.refundState says what happened to the money — the email used to promise
 * "Refund ₹X, 5–7 days" from the policy amount, even for a checkout that was
 * never paid or a refund the gateway had refused:
 *   'issued'  refunded d.refundAmount       'failed'  refund owed but delayed
 *   'none'    nothing refunded (policy)     'unpaid' / 'hide'  no money rows
 */
function generateCancellationHTML(d = {}) {
  const state = d.refundState || (Number(d.refundAmount) > 0 ? 'issued' : 'none');
  const refundRows = state === 'issued'
    ? [row('Refund Amount', inr(d.refundAmount), { valueStyle: 'color:#10b981' }), row('Refund Timeline', '5–7 working days')]
    : state === 'failed'
      ? [row('Refund', `${inr(d.refundAmount)} — processing (taking longer than usual)`, { valueStyle: 'color:#f59e0b' })]
      : state === 'none'
        ? [row('Refund', 'None — cancelled within 4 hours of the start', { valueStyle: 'color:#6b7280' })]
        : [];
  return wrap(`
    <h1 class="header" style="color:#f59e0b">Session Cancelled</h1>
    <p class="body-text">${greeting(d.recipientName)}</p>
    ${present(d.message) ? `<p class="body-text">${e(d.message)}</p>` : ''}
    ${box([
      row('Date', d.date),
      row('Time', d.time),
      row('Cancelled By', d.cancelledBy),
      ...refundRows
    ])}
    <p class="body-text" style="font-size:13px;color:#9ca3af">If you have any questions, please contact support@veraawell.com</p>
  `);
}

function generateRefundHTML(d = {}, type) {
  const isConfirmed = type === 'confirmed';
  const title = isConfirmed ? '✅ Refund Confirmed' : '⏳ Refund Initiated';
  const amount = present(d.amount) ? `of ${e(inr(d.amount))} ` : '';
  const message = isConfirmed
    ? `Your refund ${amount}has been confirmed and will reflect in your original payment method within 5–7 business days.`
    : `A refund ${amount}has been initiated. It will appear in your original payment method within 5–7 business days.`;
  return wrap(`
    <h1 class="header" style="color:${isConfirmed ? '#10b981' : '#0097b2'}">${title}</h1>
    <p class="body-text">${greeting(d.patientName)}</p>
    <p class="body-text">${message}</p>
    ${box([
      row('Refund Amount', present(d.amount) ? inr(d.amount) : null),
      row('Refund ID', present(d.refundId) ? d.refundId : 'Processing', { valueStyle: 'font-size:12px;font-family:monospace' }),
      row('Original Session', d.date)
    ])}
  `);
}

function generateDoctorSessionSummaryHTML(d = {}) {
  const withPatient = present(d.patientName) ? ` with ${e(d.patientName)}` : '';
  // From the booking's own amounts: the current fee setting may have changed
  // since, and then "Platform Fee (20%) − ₹240" contradicted itself.
  const feePercent = Number(d.price) > 0 && present(d.platformFee) ? Math.round((Number(d.platformFee) / Number(d.price)) * 1000) / 10 : d.feePercent;
  const feeLabel = present(feePercent) ? `Platform Fee (${feePercent}%)` : 'Platform Fee';
  return wrap(`
    <h1 class="header" style="color:#10b981">Session Complete 🎉</h1>
    <p class="body-text">${greeting(d.doctorName, 'Dr. ')}</p>
    <p class="body-text">Your session${withPatient} has been completed. Here's your earnings summary:</p>
    ${box([
      row('Patient', d.patientName),
      row('Date', d.date),
      row('Duration', d.duration, { suffix: ' minutes' }),
      row('Gross Revenue', present(d.price) ? inr(d.price) : null),
      row(feeLabel, present(d.platformFee) ? `− ${inr(d.platformFee)}` : null, { valueStyle: 'color:#6b7280' }),
      row('Your Earnings', present(d.earnings) ? inr(d.earnings) : null, {
        valueStyle: 'font-size:18px',
        rowStyle: 'border-top:1px solid rgba(0,151,178,0.2);padding-top:12px;margin-top:4px'
      })
    ])}
    <p class="body-text" style="font-size:13px;color:#9ca3af">Earnings are paid out weekly, by bank transfer.</p>
    <div class="btn-wrap"><a href="${e(getFrontendUrl())}/doctor-dashboard" class="btn">View Dashboard</a></div>
  `);
}

function generateSessionOutcomeHTML(d = {}) {
  const rows = [row('Session', d.when), ...(d.rows || []).map(([label, value]) => row(label, value))];
  if (present(d.amountLabel) && present(d.amount)) rows.push(row(d.amountLabel, inr(d.amount)));
  const dashboard = d.path || (d.doctor ? 'doctor-dashboard' : 'patient-dashboard');
  return wrap(`
    <h1 class="header">${e(d.title)}</h1>
    <p class="body-text">${greeting(d.recipientName, d.doctor ? 'Dr. ' : '')}</p>
    ${(d.paragraphs || []).map((p) => `<p class="body-text">${e(p)}</p>`).join('')}
    ${box(rows)}
    <p class="body-text" style="font-size:13px;color:#9ca3af">Questions? Write to support@veraawell.com</p>
    ${d.noButton ? '' : `<div class="btn-wrap"><a href="${e(getFrontendUrl())}/${e(dashboard)}" class="btn">${e(d.buttonLabel || 'Go to Dashboard')}</a></div>`}
  `);
}

function generatePayoutStatusHTML(name, status, reason) {
  const isActive = status === 'active';
  const title = isActive ? 'Bank details approved' : '⚠️ Bank details not approved';
  const color = isActive ? '#10b981' : '#ef4444';
  const message = isActive
    ? 'Your bank details are approved, so patients can now book you. Your earnings are paid out weekly, by bank transfer to the account you gave us.'
    : `We couldn't approve your bank details. Reason: ${e(present(reason) ? reason : 'please contact support.')} You can correct them in your settings.`;
  return wrap(`
    <h1 class="header" style="color:${color}">${title}</h1>
    <p class="body-text">${greeting(name, 'Dr. ')}</p>
    <p class="body-text">${message}</p>
    ${isActive ? `<div class="btn-wrap"><a href="${e(getFrontendUrl())}/doctor-dashboard" class="btn">Go to Dashboard</a></div>` : `<div class="btn-wrap"><a href="${e(getFrontendUrl())}/doctor-settings" class="btn">Re-apply Now</a></div>`}
  `);
}

module.exports = {
  sendNoticeEmail,
  sendAdminAlertEmail,
  inr,
  htmlToText,
  sendPasswordResetEmail,
  sendOTPEmail,
  sendAdminPasswordResetEmail,
  sendAdminCredentialsEmail,
  sendBookingConfirmationEmail,
  sendDoctorApprovedEmail,
  sendDoctorRejectedEmail,
  sendSessionReminderEmail,
  // New functions
  sendDoctorNewBookingEmail,
  sendPaymentFailedEmail,
  sendCancellationEmail,
  sendRefundInitiatedEmail,
  sendRefundConfirmedEmail,
  sendDoctorSessionSummaryEmail,
  sendSessionOutcomeEmail,
  sendPayoutActivatedEmail,
  sendPayoutOnboardingRejectedEmail,
  // Aliases for adminPayments.controller.js
  sendOnboardingApprovedEmail: sendPayoutActivatedEmail,
  sendOnboardingRejectedEmail: sendPayoutOnboardingRejectedEmail,
  // exported for tests
  escapeHtml,
  sendAdminDecisionEmail,
  _deliver: deliver,
  _templates: {
    generateDoctorNewBookingHTML,
    generatePaymentFailedHTML,
    generateCancellationHTML,
    generateRefundHTML,
    generateDoctorSessionSummaryHTML,
    generateSessionOutcomeHTML,
    generatePayoutStatusHTML,
    generateBookingConfirmationHTML,
    generateSessionReminderHTML
  }
};
