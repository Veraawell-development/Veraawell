const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ADMIN_ROLES = ['super_admin', 'admin', 'moderator'];

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ADMIN_ROLES, required: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  isFirstAdmin: { type: Boolean, default: false },
  isPasswordChanged: { type: Boolean, default: false },
  lastLogin: { type: Date },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
  activityLog: [{ action: String, timestamp: { type: Date, default: Date.now }, details: mongoose.Schema.Types.Mixed }]
}, { timestamps: true });

// Password hashing middleware
adminSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Activity logging method
adminSchema.methods.logActivity = async function(action, details = {}) {
  this.activityLog.push({ action, details });
  return this.save();
};

// Reset token methods
adminSchema.methods.initializeResetToken = async function() {
  const crypto = require('crypto');
  this.resetToken = crypto.randomBytes(32).toString('hex');
  this.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
  await this.save();
  return this.resetToken;
};

adminSchema.methods.clearResetToken = async function() {
  this.resetToken = null;
  this.resetTokenExpiry = null;
  return this.save();
};

adminSchema.methods.isResetTokenValid = function() {
  return this.resetToken && this.resetTokenExpiry && this.resetTokenExpiry > new Date();
};

// Static methods
adminSchema.statics.hasAnyAdmin = async function() {
  return await this.countDocuments() > 0;
};

adminSchema.statics.createFirstAdmin = async function(adminData) {
  const admin = new this({
    ...adminData,
    role: 'super_admin',
    isFirstAdmin: true,
    firstName: 'Super',
    lastName: 'Admin'
  });
  return admin.save();
};

module.exports = mongoose.model('Admin', adminSchema); 