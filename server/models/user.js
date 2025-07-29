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
    required: false,
    index: true // Add index for faster queries
  },
  resetTokenExpiry: {
    type: Date,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  try {
    // Only hash the password if it has been modified or is new
    if (!this.isModified('password')) return next();
    
    // Skip for Google users
    if (this.googleId) return next();

    // Generate salt and hash password
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
    // For Google users, always return false
    if (this.googleId) return false;
    
    // Compare passwords
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Set reset token
userSchema.methods.setResetToken = async function() {
  try {
    // Generate a secure random token
    const buffer = await require('crypto').randomBytes(48);
    const token = buffer.toString('hex');
    
    // Set token and expiry
    this.resetToken = token;
    this.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
    
    await this.save();
    return token;
  } catch (error) {
    throw new Error('Failed to set reset token');
  }
};

// Clear reset token
userSchema.methods.clearResetToken = async function() {
  try {
    this.resetToken = null;
    this.resetTokenExpiry = null;
    await this.save();
  } catch (error) {
    throw new Error('Failed to clear reset token');
  }
};

// Update password
userSchema.methods.updatePassword = async function(newPassword) {
  try {
    // Set new password (will be hashed by pre-save hook)
    this.password = newPassword;
    
    // Clear reset token
    this.resetToken = null;
    this.resetTokenExpiry = null;
    
    await this.save();
  } catch (error) {
    throw new Error('Failed to update password');
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