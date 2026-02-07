const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    otp: {
        type: String,
        required: true
    },
    purpose: {
        type: String,
        enum: ['signup', 'password-reset'],
        required: true,
        default: 'signup'
    },
    userType: {
        type: String,
        enum: ['patient', 'doctor', 'admin'],
        required: true
    },
    verified: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true // For automatic cleanup
    },
    attempts: {
        type: Number,
        default: 0,
        max: 3
    },
    resendCount: {
        type: Number,
        default: 0,
        max: 3
    }
}, {
    timestamps: true
});

// Index for faster queries
otpSchema.index({ email: 1, verified: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired OTPs

// Static method to clean up old OTPs for an email
otpSchema.statics.cleanupOldOTPs = async function (email) {
    await this.deleteMany({
        email,
        $or: [
            { expiresAt: { $lt: new Date() } },
            { verified: true }
        ]
    });
};

// Instance method to check if OTP is expired
otpSchema.methods.isExpired = function () {
    return new Date() > this.expiresAt;
};

// Instance method to check if max attempts reached
otpSchema.methods.maxAttemptsReached = function () {
    return this.attempts >= 3;
};

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;
