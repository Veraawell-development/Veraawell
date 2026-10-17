const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const VALID_ROLES = ['patient', 'doctor', 'admin', 'super_admin'];

// Schema definition with strict mode enabled
const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: VALID_ROLES,
    default: 'patient'
  },
  phoneNumber: {
    type: String,
    required: false,
    trim: true,
    sparse: true, // Allow multiple null values
    validate: {
      validator: function (v) {
        // Allow empty/null
        if (!v) return true;
        // Validate format: 10-15 digits (after removing non-digits)
        const cleaned = v.replace(/\D/g, '');
        return cleaned.length >= 10 && cleaned.length <= 15;
      },
      message: 'Phone number must be 10-15 digits'
    }
  },
  countryCode: {
    type: String,
    default: '91', // India by default
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: false
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other', 'Prefer not to say', null],
    default: null
  },
  isPasswordChanged: { type: Boolean, default: false },
  // When the password last changed, truncated to the whole second. Tokens
  // carry `iat` in whole seconds, and verifyToken/verifyAdminToken refuse a
  // token issued before this instant — that is what makes a password reset
  // actually end the sessions an attacker holding the old password had
  // opened. Without it a reset changed the password and left every existing
  // 30-day token working. Set by the pre-save hook below, so every path that
  // changes a password (reset, update, admin change, admin reset) gets it
  // without having to remember to.
  passwordChangedAt: { type: Date, default: null },
  lastLogin: { type: Date },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  activityLog: [{ action: String, timestamp: { type: Date, default: Date.now }, details: mongoose.Schema.Types.Mixed }],
  googleId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  resetToken: {
    type: String,
    default: null,
    get: v => v || null
  },
  resetTokenExpiry: {
    type: Date,
    default: null,
    get: v => v || null
  },
  profileCompleted: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  signupOTP: {
    type: String,
    default: null
  },
  signupOTPExpiry: {
    type: Date,
    default: null
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: function () {
      // Auto-approve patients, require approval for doctors and admins
      if (this.role === 'patient') return 'approved';
      if (this.role === 'super_admin') return 'approved';
      return 'pending';
    }
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },
  // upload.controller writes this on a profile-image upload. It was missing
  // from the schema, and with strict mode on Mongoose dropped the write
  // without an error — the upload succeeded and the image never stuck.
  profileImage: {
    type: String,
    default: null
  },
  // Set when a patient deletes an account that has sessions with payment
  // history: the row is kept as an anonymised tombstone so those sessions
  // (and the payouts that depend on them) still resolve. See
  // services/auth.service.js deleteAccount.
  deletedAt: {
    type: Date,
    default: null
  },
  // Online status fields (for doctors)
  isOnline: {
    type: Boolean,
    default: false
  },
  lastActiveAt: {
    type: Date,
    default: null
  },
  // Emergency contact (for patients)
  emergencyContact: {
    name: {
      type: String,
      default: null
    },
    phone: {
      type: String,
      default: null
    },
    relationship: {
      type: String,
      default: null
    }
  },
  // Doctor-specific fields
  documents: [{
    fileName: {
      type: String,
      required: false
    },
    fileUrl: {
      type: String,
      required: false
    },
    fileType: {
      type: String,
      required: false
    },
    cloudinaryPublicId: {
      type: String,
      required: false
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  specialization: {
    type: String,
    default: null,
    enum: [
      null,
      'Clinical Psychologist',
      'Counseling Psychologist',
      'Psychiatrist',
      'Psychotherapist',
      'Marriage & Family Therapist',
      'Child Psychologist',
      'Neuropsychologist',
      'Health Psychologist',
      'Forensic Psychologist',
      'Other'
    ]
  },
  licenseNumber: {
    type: String,
    default: null,
    trim: true
  },
  jobRole: {
    type: String,
    default: null,
    trim: true
  },
  professionalMessage: {
    type: String,
    default: null,
    trim: true
  },
  heardAboutUs: {
    type: String,
    enum: [
      null,
      'LinkedIn',
      'Facebook',
      'Instagram',
      'Friend/Colleague',
      'Search Engine',
      'Other'
    ],
    default: null
  }
}, {
  timestamps: true,
  strict: true,
  strictQuery: true,
  // Credentials never leave through res.json(user). Several admin endpoints
  // returned whole User documents with only `-password` projected, which
  // published live password-reset tokens to every admin — enough to take
  // over any account in one request. Projections at the query are still the
  // first line (routes/admin/approvals.js); this is the backstop for the
  // next query that forgets one.
  //
  // toJSON only, deliberately not toObject: internal code calls toObject()
  // to read these fields, and the reset flow depends on it.
  toJSON: {
    transform(doc, ret) {
      delete ret.password;
      delete ret.resetToken;
      delete ret.resetTokenExpiry;
      return ret;
    }
  }
});

// Indexes for efficient queries
// Note: email, username, and googleId already have unique indexes defined in schema
// Only add compound and non-unique indexes here
userSchema.index({ role: 1, approvalStatus: 1 }); // For doctor/admin queries
userSchema.index({ role: 1, isOnline: 1 }); // For online doctors query
userSchema.index({ resetToken: 1, resetTokenExpiry: 1 }); // Compound index for password reset

// Virtual to check if password reset is active
userSchema.virtual('isResetActive').get(function () {
  return !!(this.resetToken && this.resetTokenExpiry && this.resetTokenExpiry > new Date());
});

// Ensure reset token fields are always in sync
userSchema.pre('save', async function (next) {
  // If either field is being modified, ensure they are in sync
  if (this.isModified('resetToken') || this.isModified('resetTokenExpiry')) {
    // If either field is null/empty/undefined, clear both
    if (!this.resetToken || !this.resetTokenExpiry) {
      this.resetToken = null;
      this.resetTokenExpiry = null;
    }

    // If token exists but expiry is in the past, clear both
    if (this.resetTokenExpiry && this.resetTokenExpiry < new Date()) {
      this.resetToken = null;
      this.resetTokenExpiry = null;
    }
  }
  next();
});

// Stamp passwordChangedAt on every password change of an existing account.
// Runs before the hashing hook below, which returns early for Google accounts
// — a password change must invalidate old tokens either way. Truncated to the
// second because JWT `iat` is in seconds: a token minted later in the same
// second as the change (the fresh one a reset or update hands back) must
// still verify.
userSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified('password')) {
    this.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('password')) return next();
    if (this.googleId) return next();
    
    // Skip if already a bcrypt hash
    if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) return next();

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Activity logging method
userSchema.methods.logActivity = async function (action, details = {}) {
  this.activityLog.push({ action, details });
  return this.save();
};

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    if (this.googleId) return false;
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Initialize reset token
userSchema.methods.initializeResetToken = async function () {
  try {
    const buffer = await crypto.randomBytes(48);
    const token = buffer.toString('hex');

    this.resetToken = token;
    this.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await this.save();
    return token;
  } catch (error) {
    throw new Error('Failed to initialize reset token');
  }
};

// Clear reset token
userSchema.methods.clearResetToken = async function () {
  try {
    this.resetToken = null;
    this.resetTokenExpiry = null;
    await this.save();
  } catch (error) {
    throw new Error('Failed to clear reset token');
  }
};

// Update password
userSchema.methods.updatePassword = async function (newPassword) {
  try {
    this.password = newPassword;
    await this.clearResetToken();
  } catch (error) {
    throw new Error('Failed to update password');
  }
};

// Static method to migrate existing documents
userSchema.statics.migrateResetTokens = async function () {
  try {
    const { createLogger } = require('../utils/logger');
    const logger = createLogger('USER-MIGRATION');

    logger.info('Starting reset token migration...');

    // Find users with expired or inconsistent tokens
    const query = {
      $or: [
        { resetToken: { $exists: true, $ne: null }, resetTokenExpiry: { $lt: new Date() } }, // Expired tokens
        { resetToken: { $exists: true, $ne: null }, resetTokenExpiry: { $exists: false } }, // Token without expiry
        { resetToken: { $exists: false }, resetTokenExpiry: { $exists: true, $ne: null } } // Expiry without token
      ]
    };

    const usersToUpdate = await this.find(query).countDocuments();
    logger.info(`Found ${usersToUpdate} users needing reset token cleanup.`);

    if (usersToUpdate === 0) {
      logger.info('No users need reset token migration.');
      return 0;
    }

    const result = await this.updateMany(query, {
      $set: {
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    logger.info(`Reset token migration completed successfully. Updated ${result.modifiedCount} users.`);
    return result.modifiedCount;
  } catch (error) {
    const { createLogger } = require('../utils/logger');
    const logger = createLogger('USER-MIGRATION');
    logger.error('Migration failed', { error: error.message });
    throw error;
  }
};

// Static method to check if a role is valid
userSchema.statics.isValidRole = function (role) {
  return VALID_ROLES.includes(role);
};

// Static method to create admin
userSchema.statics.createAdmin = async function (adminData) {
  const admin = new this({
    ...adminData,
    role: 'admin'
  });
  return admin.save();
};

// Static method to check if any admin exists
userSchema.statics.hasAnyAdmin = async function () {
  return await this.countDocuments({ role: { $in: ['admin', 'super_admin'] } }) > 0;
};

// Static method to create the first admin
userSchema.statics.createFirstAdmin = async function (adminData) {
  const admin = new this({
    ...adminData,
    role: 'super_admin',
    isPasswordChanged: false // Force password change on first login
  });
  return admin.save();
};

module.exports = mongoose.model('User', userSchema); 