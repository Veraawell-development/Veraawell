const mongoose = require('mongoose');

const doctorProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  specialization: [{
    type: String,
    required: true
  }],
  experience: {
    type: Number,
    required: true,
    min: 0
  },
  qualification: [{
    type: String,
    required: true
  }],
  languages: [{
    type: String,
    required: true
  }],
  treatsFor: [{
    type: String,
    required: true
  }],
  pricing: {
    min: {
      type: Number,
      required: true,
      min: 0
    },
    max: {
      type: Number,
      required: true,
      min: 0
    }
  },
  profileImage: {
    type: String,
    default: '/doctor-placeholder.svg'
  },
  bio: {
    type: String,
    maxlength: 1000
  },
  type: {
    type: String,
    required: true
  },
  modeOfSession: [{
    type: String
  }],
  quote: {
    type: String
  },
  quoteAuthor: {
    type: String
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: 0
    },
    distribution: {
      5: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      1: { type: Number, default: 0 }
    }
  },
  availability: {
    monday: { type: Boolean, default: true },
    tuesday: { type: Boolean, default: true },
    wednesday: { type: Boolean, default: true },
    thursday: { type: Boolean, default: true },
    friday: { type: Boolean, default: true },
    saturday: { type: Boolean, default: false },
    sunday: { type: Boolean, default: false }
  },
  workingHours: {
    start: { type: String, default: '09:00' },
    end: { type: String, default: '18:00' }
  }
}, {
  timestamps: true
});

// Index for efficient queries
// Note: userId already has unique index from schema definition
doctorProfileSchema.index({ specialization: 1 });
doctorProfileSchema.index({ isOnline: 1 });
doctorProfileSchema.index({ 'rating.average': -1 });

// Virtual for full name
doctorProfileSchema.virtual('fullName').get(function () {
  return `${this.userId.firstName} ${this.userId.lastName}`;
});

// Method to check if doctor is available on a specific day
doctorProfileSchema.methods.isAvailableOn = function (dayOfWeek) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[dayOfWeek];
  return this.availability[dayName];
};

// Static method to get all doctors with their profiles
doctorProfileSchema.statics.getAllDoctorsWithProfiles = async function () {
  return await this.find({ isOnline: true })
    .populate('userId', 'firstName lastName email')
    .sort({ 'rating.average': -1 });
};

module.exports = mongoose.model('DoctorProfile', doctorProfileSchema);
