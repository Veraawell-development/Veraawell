const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const VALID_ROLES = ['patient', 'doctor', 'admin'];

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
    default: undefined,
    set: v => v === null ? undefined : v // Convert null to undefined
  },
  resetTokenExpiry: {
    type: Date,
    default: undefined,
    set: v => v === null ? undefined : v // Convert null to undefined
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving (only for non-Google users)
userSchema.pre('save', async function(next) {
  // Skip password hashing for Google OAuth users
  if (this.googleId) {
    return next();
  }
  
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (this.googleId) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to clear reset token
userSchema.methods.clearResetToken = function() {
  this.resetToken = undefined;
  this.resetTokenExpiry = undefined;
};

// Method to set reset token
userSchema.methods.setResetToken = function(token, expiry) {
  this.resetToken = token;
  this.resetTokenExpiry = expiry;
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