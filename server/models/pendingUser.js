const mongoose = require('mongoose');

const pendingUserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, default: '' },
  email: { type: String, required: true, lowercase: true, index: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  phoneNumber: { type: String, default: '' },
  
  // Fields specifically for doctors
  approvalStatus: { type: String },
  doctorDetails: { type: mongoose.Schema.Types.Mixed },
  
  // OTP Verification
  otp: { type: String, required: true },
  
  // Automatically delete unverified accounts after 15 minutes (900 seconds)
  createdAt: { type: Date, default: Date.now, expires: 900 }
});

const bcrypt = require('bcryptjs');

// Hash password before saving
pendingUserSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('PendingUser', pendingUserSchema);
