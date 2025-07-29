const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const VALID_ROLES = ['patient', 'doctor', 'admin'];

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
    lowercase: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
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
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  resetToken: {
    type: String,
    default: '',
    set: v => v || ''
  },
  resetTokenExpiry: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  strict: true,
  strictQuery: true
});

// Add compound index for reset token fields
userSchema.index({ resetToken: 1, resetTokenExpiry: 1 });

// Virtual to check if password reset is active
userSchema.virtual('isResetActive').get(function() {
  return !!(this.resetToken && this.resetToken !== '' && 
           this.resetTokenExpiry && this.resetTokenExpiry > new Date());
});

// Ensure reset token fields are always in a valid state
userSchema.pre('save', async function(next) {
  // Initialize fields if they don't exist
  if (!this.hasOwnProperty('resetToken')) {
    this.resetToken = '';
  }
  if (!this.hasOwnProperty('resetTokenExpiry')) {
    this.resetTokenExpiry = null;
  }

  // Ensure consistent state
  if (!this.resetToken || this.resetToken === '') {
    this.resetToken = '';
    this.resetTokenExpiry = null;
  }

  // If token exists but no expiry, clear both
  if (this.resetToken && !this.resetTokenExpiry) {
    this.resetToken = '';
    this.resetTokenExpiry = null;
  }

  // If expiry exists but no token, clear both
  if (!this.resetToken && this.resetTokenExpiry) {
    this.resetToken = '';
    this.resetTokenExpiry = null;
  }

  // If expiry is in the past, clear both
  if (this.resetTokenExpiry && this.resetTokenExpiry < new Date()) {
    this.resetToken = '';
    this.resetTokenExpiry = null;
  }

  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  try {
    if (!this.isModified('password')) return next();
    if (this.googleId) return next();
    
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    if (this.googleId) return false;
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Initialize reset token
userSchema.methods.initializeResetToken = async function() {
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
userSchema.methods.clearResetToken = async function() {
  try {
    this.resetToken = '';
    this.resetTokenExpiry = null;
    await this.save();
  } catch (error) {
    throw new Error('Failed to clear reset token');
  }
};

// Update password
userSchema.methods.updatePassword = async function(newPassword) {
  try {
    this.password = newPassword;
    await this.clearResetToken();
  } catch (error) {
    throw new Error('Failed to update password');
  }
};

// Static method to migrate existing documents
userSchema.statics.migrateResetTokens = async function() {
  try {
    // Find all documents with inconsistent reset token state
    const users = await this.find({
      $or: [
        { resetToken: { $exists: false } },
        { resetTokenExpiry: { $exists: false } },
        { resetToken: null },
        { resetTokenExpiry: { $ne: null, $lt: new Date() } },
        { resetToken: { $ne: '' }, resetTokenExpiry: null },
        { resetToken: '', resetTokenExpiry: { $ne: null } }
      ]
    });

    console.log(`Found ${users.length} users with inconsistent reset tokens`);

    for (const user of users) {
      // Reset both fields to initial state
      user.resetToken = '';
      user.resetTokenExpiry = null;
      await user.save();
    }

    console.log('Migration completed successfully');
    return users.length;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

// Static method to check if a role is valid
userSchema.statics.isValidRole = function(role) {
  return VALID_ROLES.includes(role);
};

// Static method to create admin
userSchema.statics.createAdmin = async function(adminData) {
  const admin = new this({
    ...adminData,
    role: 'admin'
  });
  return admin.save();
};

module.exports = mongoose.model('User', userSchema); 