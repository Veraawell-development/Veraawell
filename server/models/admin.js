const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ADMIN_ROLES = ['super_admin', 'admin', 'moderator'];

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ADMIN_ROLES,
    required: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  isFirstAdmin: {
    type: Boolean,
    default: false
  },
  isPasswordChanged: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },
  activityLog: [{
    action: String,
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Hash password before saving
adminSchema.pre('save', async function(next) {
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
adminSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Log activity method
adminSchema.methods.logActivity = async function(action, details = {}) {
  this.activityLog.push({ action, details });
  await this.save();
};

// Static method to check if any admin exists
adminSchema.statics.hasAnyAdmin = async function() {
  return await this.countDocuments() > 0;
};

// Static method to create first admin
adminSchema.statics.createFirstAdmin = async function(adminData) {
  const existingAdmin = await this.findOne();
  if (existingAdmin) {
    throw new Error('Cannot create first admin: admins already exist');
  }

  const admin = new this({
    ...adminData,
    role: 'super_admin',
    isFirstAdmin: true,
    isPasswordChanged: false
  });

  return admin.save();
};

module.exports = mongoose.model('Admin', adminSchema); 