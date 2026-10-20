/**
 * Authentication Service
 * Business logic for authentication operations
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user');
const PendingUser = require('../models/pendingUser');
const { getJWTSecret, getCookieConfig, toClearOptions } = require('../config/auth');
const { TOKEN_EXPIRY } = require('../config/constants');
const { AuthenticationError, AuthorizationError, NotFoundError, ConflictError, ValidationError, RateLimitError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const { generateOTP, hashOTP } = require('../utils/otpGenerator');
const { isOwnCloudinaryUrl } = require('../utils/cloudinaryUrl');

const logger = createLogger('AUTH-SERVICE');

/**
 * Signup codes. Each code allows MAX_SIGNUP_OTP_ATTEMPTS guesses; a signup
 * may be issued at most MAX_SIGNUP_OTP_RESENDS replacement codes, whether by
 * the "Resend code" button, by logging in while unverified, or by
 * registering again. Together that bounds guesses per signup at
 * 5 x (1 + 5) = 30 against a space of 900,000.
 */
const MAX_SIGNUP_OTP_ATTEMPTS = 5;
const MAX_SIGNUP_OTP_RESENDS = 5;

const SUSPENDED_MESSAGE = 'This account has been suspended. Please contact support@veraawell.com.';

/**
 * Generate JWT token
 */
function generateToken(user) {
  const secret = getJWTSecret();
  const payload = {
    userId: user._id,
    username: user.username,
    role: user.role
  };

  return jwt.sign(payload, secret, { expiresIn: TOKEN_EXPIRY.ACCESS_TOKEN });
}

/**
 * Set authentication cookie
 */
function setAuthCookie(res, token) {
  const cookieConfig = getCookieConfig();
  res.cookie('token', token, cookieConfig);
}

/**
 * Clear the auth cookie with the domain/path/sameSite/secure it was set with
 * — see toClearOptions in config/auth.js for why a bare clearCookie('token')
 * cleared nothing in production.
 */
function clearAuthCookie(res) {
  res.clearCookie('token', toClearOptions(getCookieConfig()));
}


/**
 * A doctor applicant's verification documents must be files they uploaded
 * through /api/upload/doctor-document(s). The URL arrives in the request
 * body, so without this an applicant could submit any link — a page they
 * control, which they can change after an admin has looked at it — as their
 * licence.
 */
function assertOwnDocuments(documents) {
  if (documents === undefined || documents === null) return;
  if (!Array.isArray(documents)) {
    throw new ValidationError('Validation failed', { documents: 'Documents must be a list of uploaded files' });
  }
  documents.forEach((doc, i) => {
    if (!doc || !isOwnCloudinaryUrl(doc.fileUrl)) {
      throw new ValidationError('Validation failed', {
        [`documents.${i}.fileUrl`]: 'Documents must be uploaded through Veraawell'
      });
    }
  });
}

/**
 * Validate registration data against the User schema it will eventually be
 * written to.
 *
 * Signup is two-step: PendingUser now, User at verify-signup. PendingUser
 * accepts nearly anything, so a value the User schema rejects — a
 * specialization outside its enum, a phone number of the wrong length —
 * used to surface only at verify-signup, as a 400 after the person had
 * entered a correct code, with nothing they could do but start again. The
 * candidate is built exactly as verifySignup builds it and validated without
 * being saved.
 */
async function assertValidAsUser(data) {
  const { otp, doctorDetails, resetToken, resetTokenExpiry, ...fields } = data;
  const candidate = new User({ ...fields, isVerified: true });
  try {
    await candidate.validate();
  } catch (error) {
    if (error.name !== 'ValidationError' || !error.errors) throw error;
    // Field -> message only. A raw Mongoose error carries each offending
    // value, and one of the fields on this document is a password.
    const errors = {};
    for (const [path, detail] of Object.entries(error.errors)) {
      errors[path] = detail.message;
    }
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * Register new user
 */
async function registerUser(userData) {
  const {
    firstName,
    lastName,
    email,
    password,
    role = 'patient',
    phoneNo,
    username,
    // Doctor-specific fields
    documents,
    specialization,
    licenseNumber,
    jobRole,
    professionalMessage,
    heardAboutUs
  } = userData;

  if (role === 'doctor') assertOwnDocuments(documents);

  // Email ownership is proven by the PendingUser OTP handshake
  // (verifySignup). A second, standalone OTP system under /api/otp used to
  // gate this step; its check here had been commented out, nothing in the
  // client called it, and it has been removed.

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ConflictError('User already exists');
  }

  // Username uniqueness is a unique index on User, which nothing checked
  // until verify-signup tried to insert — after the person had already gone
  // to their inbox and typed in a correct code. Checked against emails too:
  // login matches `email OR username`, so a username equal to someone
  // else's address would make that login ambiguous.
  const normalizedUsername = (username || email).toLowerCase().trim();
  const usernameTaken = await User.findOne({
    $or: [{ username: normalizedUsername }, { email: normalizedUsername }]
  }).select('_id');
  if (usernameTaken) {
    throw new ConflictError('That username is already taken');
  }

  // Create user with explicit approvalStatus
  // Every screen adds "Dr." for a doctor, so a doctor who typed it into their
  // own first name was shown as "Dr. Dr. Asha".
  const cleanFirst = role === 'doctor' ? firstName.trim().replace(/^dr\.?\s+/i, '') || firstName.trim() : firstName.trim();
  const newUserData = {
    firstName: cleanFirst,
    lastName: (lastName || '').trim(),
    email: email.toLowerCase().trim(),
    username: normalizedUsername,
    password,
    phoneNumber: phoneNo || '',
    role,
    resetToken: null,
    resetTokenExpiry: null
  };

  // Add doctor or admin specific fields and set pending status
  if (role === 'doctor' || role === 'admin') {
    newUserData.approvalStatus = 'pending';
    if (role === 'doctor') {
      if (documents && Array.isArray(documents)) {
        // Only the declared fields, not whatever else the client attached.
        newUserData.documents = documents.map(({ fileName, fileUrl, fileType, cloudinaryPublicId }) => ({
          fileName, fileUrl, fileType, cloudinaryPublicId
        }));
      }
      if (specialization) {
        newUserData.specialization = specialization;
      }
      if (licenseNumber) {
        newUserData.licenseNumber = licenseNumber.trim();
      }
      if (jobRole) {
        newUserData.jobRole = jobRole.trim();
      }
      if (professionalMessage) {
        newUserData.professionalMessage = professionalMessage.trim();
      }
      if (heardAboutUs) {
        newUserData.heardAboutUs = heardAboutUs;
      }
      logger.info('Doctor registration - setting approvalStatus to pending');
    } else {
      logger.info('Admin registration - setting approvalStatus to pending');
    }
  } else {
    newUserData.approvalStatus = 'approved';
  }

  // Everything the User schema will check at verify-signup, checked now —
  // before an OTP is generated or sent.
  await assertValidAsUser(newUserData);

  // Registering again is the other way to get a fresh code, so it draws on
  // the same budget as a login-triggered resend. Otherwise the resend cap
  // (see the login controller) would be one extra request away from
  // meaningless. The budget lives on the pending row, so it resets once that
  // row's 15-minute TTL lapses.
  const previous = await PendingUser.findOne({ email: newUserData.email }).select('resendCount');
  const resendCount = previous ? (previous.resendCount || 0) + 1 : 0;
  if (resendCount > MAX_SIGNUP_OTP_RESENDS) {
    throw new RateLimitError('Too many verification codes have been requested for this address. Please wait 15 minutes and try again.');
  }
  newUserData.resendCount = resendCount;

  // Generate 6-digit OTP for email verification. Only the bcrypt hash is
  // persisted — the plaintext is returned alongside the document so the
  // caller can email it, but it is never written to the database.
  const otp = generateOTP();
  newUserData.otp = await hashOTP(otp);
  
  // Format doctorDetails object if there are any
  if (role === 'doctor' || role === 'admin') {
      newUserData.doctorDetails = {
          documents: newUserData.documents,
          specialization: newUserData.specialization,
          licenseNumber: newUserData.licenseNumber,
          jobRole: newUserData.jobRole,
          professionalMessage: newUserData.professionalMessage,
          heardAboutUs: newUserData.heardAboutUs
      };
      delete newUserData.documents;
      delete newUserData.specialization;
      delete newUserData.licenseNumber;
      delete newUserData.jobRole;
      delete newUserData.professionalMessage;
      delete newUserData.heardAboutUs;
  }

  // Delete any existing pending user with this email
  await PendingUser.deleteMany({ email: email.toLowerCase().trim() });

  const pendingUser = new PendingUser(newUserData);
  await pendingUser.save();

  logger.info('User registration pending OTP verification', {
    email: pendingUser.email,
    role: pendingUser.role
  });

  // Attach the plaintext OTP as a transient, non-persisted property so the
  // controller can email it without it ever having been written to the DB.
  pendingUser.plainOtp = otp;
  return pendingUser;
}

/**
 * Authenticate user login
 */
async function authenticateUser(username, password, requestedRole = null) {
  // Find user by email or username. Trimmed: a phone keyboard's autocomplete
  // leaves a trailing space after an address, and " a@b.com" used to come
  // back as "User not found. Please sign up first."
  const identifier = String(username).trim().toLowerCase();
  const user = await User.findOne({
    $or: [
      { email: identifier },
      { username: identifier }
    ]
  });

  if (!user) {
    throw new AuthenticationError('User not found. Please sign up first.');
  }

  // Check if Google user trying to login with password
  if (user.googleId) {
    throw new AuthenticationError('Please use Google Sign-In to log in');
  }

  // Verify password FIRST. The role and approval checks below used to run
  // before it, so anyone who typed an address — no password needed — learned
  // the account's role, whether it was approved, and an admin's free-text
  // rejection reason. Nothing about the account is disclosed until the
  // caller has proven they own it.
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AuthenticationError('Invalid credentials');
  }

  // A suspended account was let through here and refused by verifyToken on
  // the very next request, so the person saw "Login successful" and then
  // the login page again with no explanation. Refused here instead, with
  // the reason — after the password, so only the owner learns it.
  if (user.status && user.status !== 'active') {
    throw new AuthorizationError(SUSPENDED_MESSAGE, 403);
  }

  // Check role mismatch
  if (requestedRole && requestedRole !== user.role) {
    throw new AuthenticationError(
      `You are registered as a ${user.role}. Please use the correct role to login.`,
      400
    );
  }

  // Admin self-registration (AdminSignupPage.tsx) sets approvalStatus:
  // 'pending' exactly like doctor registration does — this check used to only
  // cover role === 'doctor', so a self-registered, still-pending admin could
  // authenticate via the regular login while a pending doctor could not. Not
  // exploitable today (nothing currently branches admin-only behavior off a
  // regular verifyToken session — real admin routes require the separate
  // verifyAdminToken/ADMIN_JWT_SECRET path), but it's an approval workflow
  // that should actually hold regardless.
  const requiresApproval = user.role === 'doctor' || user.role === 'admin';
  if (requiresApproval && user.approvalStatus !== 'approved') {
    logger.warn(`${user.role} login blocked - not approved`, {
      userId: user._id.toString().substring(0, 8),
      role: user.role,
      approvalStatus: user.approvalStatus
    });

    if (user.approvalStatus === 'pending') {
      throw new AuthorizationError(
        `Your ${user.role} account is pending approval. An admin will review your application soon.`,
        403
      );
    } else if (user.approvalStatus === 'rejected') {
      throw new AuthorizationError(
        `Your ${user.role} account has been rejected. Reason: ${user.rejectionReason || 'No reason provided'}`,
        403
      );
    }
    throw new AuthorizationError(`Your ${user.role} account requires approval before you can login.`, 403);
  }

  logger.info('User authenticated successfully', {
    userId: user._id.toString().substring(0, 8),
    email: user.email,
    role: user.role
  });

  return user;
}

/**
 * Handle password reset request
 */
async function requestPasswordReset(email) {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() });

  if (!user) {
    throw new NotFoundError('User');
  }

  // Admin accounts reset through /api/admin/auth/forgot-password, which has
  // its own rate limit and rules. This user-realm path used to work for them
  // too, side-stepping both.
  if (['admin', 'super_admin'].includes(user.role)) {
    throw new NotFoundError('User');
  }

  if (user.googleId) {
    throw new AuthenticationError('This account uses Google login. Please use Google Sign-In.');
  }

  // Clear any existing reset token
  await user.clearResetToken();

  // Initialize new reset token
  const resetToken = await user.initializeResetToken();

  logger.info('Password reset token generated', {
    email: user.email,
    hasToken: !!user.resetToken,
    tokenExpiry: user.resetTokenExpiry
  });

  return { user, resetToken };
}

/**
 * Reset password with token
 */
async function resetPassword(token, newPassword) {
  const user = await User.findOne({
    resetToken: User.hashResetToken(token),
    role: { $nin: ['admin', 'super_admin'] }
  });

  // All 400s: each is an answer about the link or the form. NotFoundError
  // appends " not found" to its argument, so this one used to read "...a new
  // password reset. not found" on the page; and a 401 is how the client
  // recognises a session that has ended, which these are not.
  if (!user) {
    throw new ValidationError('This reset link is invalid or has already been used. Please request a new one.');
  }

  if (!user.isResetActive) {
    await user.clearResetToken();
    throw new ValidationError('This reset link has expired. Please request a new one.');
  }

  if (user.googleId) {
    throw new ValidationError('You signed up with Google. Please use Google Sign-In to log in.');
  }

  // Verify the new password is different from the current one
  const isSamePassword = await user.comparePassword(newPassword);
  if (isSamePassword) {
    throw new ValidationError('New password must be different from your current password');
  }

  // Update password
  await user.updatePassword(newPassword);

  logger.info('Password reset successful', {
    email: user.email
  });

  return user;
}

/**
 * Get user profile
 */
async function getUserProfile(userId) {
  const user = await User.findById(userId).select('-password -resetToken -resetTokenExpiry');

  if (!user) {
    throw new NotFoundError('User');
  }

  return user;
}

/**
 * Update user password
 */
async function updatePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // A Google account has no password the person knows, so "current
  // password" could only ever come back "incorrect".
  if (user.googleId) {
    throw new ValidationError('This account signs in with Google, so it has no password to change.');
  }

  // 400, not 401: the session is fine, the field is wrong. A 401 here reads
  // to the client as "your session has ended".
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new ValidationError('Incorrect current password', { currentPassword: 'Incorrect current password' });
  }

  if (currentPassword === newPassword) {
    throw new ValidationError('New password must be different from your current password', {
      newPassword: 'New password must be different from your current password'
    });
  }

  user.password = newPassword;
  await user.save();
  return true;
}

/**
 * Delete user account
 */
async function deleteAccount(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const Session = require('../models/session');

  // A practitioner's sessions are not theirs alone. The cascade below deletes
  // by `doctorId` as well as `patientId`, so a doctor deleting their own
  // account used to erase every patient's session, report, note and task
  // with them — clinical records the patients are entitled to, and the
  // payment and refund history the platform is obliged to keep. That is not
  // a self-service action. Until there is a proper offboarding flow
  // (reassign or archive, then deactivate), it goes through support.
  if (user.role === 'doctor') {
    const hasSessions = await Session.exists({ doctorId: user._id });
    if (hasSessions) {
      logger.warn('Refused self-deletion of a doctor account with sessions', {
        userId: user._id.toString().substring(0, 8)
      });
      throw new ConflictError(
        'Your account has session history with patients, so it cannot be deleted from here. Please contact support@veraawell.com and we will close it without losing your patients\' records.'
      );
    }
  }

  // A patient with a booking still to come must cancel it first. Deleting
  // around it left a paid session scheduled for an account that no longer
  // exists — the doctor would turn up for nobody, and the patient's refund
  // entitlement (which depends on how early they cancel) was never decided.
  if (user.role === 'patient') {
    const upcoming = await Session.exists({
      patientId: user._id,
      // An unfinished checkout is not a booking: nothing was paid, and it is
      // deleted with the account below.
      status: { $in: ['scheduled', 'active'] },
      endsAt: { $gte: new Date() }
    });
    if (upcoming) {
      throw new ConflictError(
        'You have an upcoming session. Please cancel it first (refunds follow our cancellation policy), then delete your account.'
      );
    }
  }

  const DoctorProfile = require('../models/doctorProfile');
  const Review = require('../models/review');
  // These five were previously NOT cascade-deleted — journal entries, mood
  // history, task records, doctor-authored reports, session notes, and mental
  // health assessment results all survived account deletion indefinitely.
  // For a mental-health platform, that's exactly the category of data a user
  // deleting their account most expects to actually be gone.
  const Journal = require('../models/journal');
  const MoodEntry = require('../models/moodEntry');
  const Task = require('../models/task');
  const Report = require('../models/report');
  const SessionReport = require('../models/sessionReport');
  const SessionNote = require('../models/sessionNote');
  const MentalHealthAssessment = require('../models/mentalHealthAssessment');

  // A patient's sessions that moved money are kept. Deleting them — as this
  // used to, along with everything else — removed the rows the payout ledger
  // pays doctors from and the only record of a charge or refund, so a doctor
  // could go unpaid for a session they gave and a refund dispute had nothing
  // to stand on. What a patient expects to be gone is their identity and
  // their clinical record: the account is anonymised below and the clinical
  // collections are deleted as before; the kept rows keep only times and
  // amounts.
  const isDoctor = user.role === 'doctor';
  const keptSessionCount = isDoctor
    ? 0
    : await Session.countDocuments({ patientId: userId, $or: FINANCIAL_SESSION });
  const sessionsToDelete = isDoctor
    ? { $or: [{ patientId: userId }, { doctorId: userId }] }
    : { patientId: userId, $nor: FINANCIAL_SESSION };

  // Cascade delete all associated data in parallel
  await Promise.all([
    Session.deleteMany(sessionsToDelete),
    // Conversations and messages stay: the other person keeps their copy of
    // the thread (a therapist's record of what was said), shown from a
    // "Deleted user" who can no longer send or receive.
    DoctorProfile.deleteOne({ userId }),
    Review.deleteMany({ $or: [{ patientId: userId }, { doctorId: userId }] }),
    Journal.deleteMany({ patientId: userId }),
    MoodEntry.deleteMany({ patientId: userId }),
    Task.deleteMany({ $or: [{ patientId: userId }, { doctorId: userId }] }),
    Report.deleteMany({ $or: [{ patientId: userId }, { doctorId: userId }] }),
    SessionReport.deleteMany({ $or: [{ patientId: userId }, { doctorId: userId }] }),
    SessionNote.deleteMany({ $or: [{ patientId: userId }, { doctorId: userId }] }),
    MentalHealthAssessment.deleteMany({ userId })
  ]);

  if (keptSessionCount > 0) {
    // The kept sessions still name this user, and every screen that lists
    // them populates patientId — so the row stays, as a tombstone with
    // nothing identifying left on it and no way to sign in. Free-text
    // booking notes go with the identity.
    await Session.updateMany({ patientId: userId }, { $set: { sessionNotes: '' } });
    await anonymiseUser(user);
    logger.info('Account anonymised; sessions with payment history kept', {
      userId: userId.toString().substring(0, 8), keptSessions: keptSessionCount
    });
  } else {
    await User.findByIdAndDelete(userId);
    logger.info('Account and all associated data deleted', { userId: userId.toString().substring(0, 8) });
  }
  return true;
}

/**
 * Sessions with money attached: a gateway payment id, a paid or refunded
 * state, or a place in a payout. These outlive the patient's account.
 */
const FINANCIAL_SESSION = [
  { paymentId: { $nin: [null, ''] } },
  { paymentStatus: { $in: ['paid', 'refunded', 'refund_pending', 'refund_failed'] } },
  { payoutId: { $ne: null } }
];

/**
 * Strip a deleted account down to a tombstone. The email and username are
 * replaced with unique placeholders, so the address is free to register
 * again; the password is replaced with one nobody knows, which also stamps
 * passwordChangedAt and so retires every token the account had.
 */
async function anonymiseUser(user) {
  const tombstone = `deleted-${user._id}`;
  user.set({
    firstName: 'Deleted',
    lastName: 'user',
    email: `${tombstone}@deleted.invalid`,
    username: tombstone,
    phoneNumber: null,
    dateOfBirth: undefined,
    gender: null,
    emergencyContact: { name: null, phone: null, relationship: null },
    profileImage: null,
    documents: [],
    activityLog: [],
    resetToken: null,
    resetTokenExpiry: null,
    signupOTP: null,
    signupOTPExpiry: null,
    isOnline: false,
    status: 'suspended',
    deletedAt: new Date()
  });
  user.googleId = undefined;
  user.password = require('crypto').randomBytes(32).toString('hex');
  await user.save();
}

module.exports = {
  SUSPENDED_MESSAGE,
  MAX_SIGNUP_OTP_ATTEMPTS,
  MAX_SIGNUP_OTP_RESENDS,
  generateToken,
  setAuthCookie,
  clearAuthCookie,
  registerUser,
  authenticateUser,
  requestPasswordReset,
  resetPassword,
  getUserProfile,
  updatePassword,
  deleteAccount
};
