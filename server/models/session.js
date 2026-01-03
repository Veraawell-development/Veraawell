const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionDate: {
    type: Date,
    required: true
  },
  sessionTime: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 60, // minutes
    required: true
  },
  sessionType: {
    type: String,
    enum: ['discovery', 'regular', 'follow-up', 'immediate'],
    default: 'regular'
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled', 'no-show'],
    default: 'scheduled'
  },
  price: {
    type: Number,
    required: true
  },
  doctorJoined: {
    type: Boolean,
    default: false
  },
  patientJoined: {
    type: Boolean,
    default: false
  },
  doctorJoinedAt: {
    type: Date
  },
  patientJoinedAt: {
    type: Date
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  paymentId: {
    type: String,
    default: null
  },
  sessionNotes: {
    type: String,
    default: ''
  },
  meetingLink: {
    type: String,
    default: null
  },
  // Call history tracking fields
  callStartTime: {
    type: Date,
    default: null
  },
  callEndTime: {
    type: Date,
    default: null
  },
  actualDuration: {
    type: Number, // in minutes
    default: 0
  },
  callStatus: {
    type: String,
    enum: ['not-started', 'in-progress', 'completed', 'failed'],
    default: 'not-started'
  },
  callMode: {
    type: String,
    enum: ['Video Calling', 'Voice Calling', 'Cancelled & Refunded'],
    default: 'Video Calling'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
sessionSchema.index({ patientId: 1, sessionDate: 1 }); // Patient session history
sessionSchema.index({ doctorId: 1, sessionDate: 1 }); // Doctor session history
sessionSchema.index({ sessionDate: 1, status: 1 }); // Calendar queries
sessionSchema.index({ status: 1, callStatus: 1 }); // Status-based queries
sessionSchema.index({ doctorId: 1, status: 1 }); // Doctor active sessions
sessionSchema.index({ patientId: 1, status: 1 }); // Patient active sessions
sessionSchema.index({ createdAt: -1 }); // Recent sessions

// Virtual for session end time
sessionSchema.virtual('sessionEndTime').get(function () {
  const [hours, minutes] = this.sessionTime.split(':').map(Number);
  const startTime = new Date(this.sessionDate);
  startTime.setHours(hours, minutes, 0, 0);

  const endTime = new Date(startTime.getTime() + (this.duration * 60000));
  return endTime.toTimeString().slice(0, 5);
});

// Method to check if session is upcoming
sessionSchema.methods.isUpcoming = function () {
  const now = new Date();
  const sessionDateTime = new Date(this.sessionDate);
  const [hours, minutes] = this.sessionTime.split(':').map(Number);
  sessionDateTime.setHours(hours, minutes, 0, 0);

  return sessionDateTime > now && this.status === 'scheduled';
};

// Method to check if session can be joined (within 15 minutes of start time)
sessionSchema.methods.canJoin = function () {
  const now = new Date();
  const sessionDateTime = new Date(this.sessionDate);
  const [hours, minutes] = this.sessionTime.split(':').map(Number);
  sessionDateTime.setHours(hours, minutes, 0, 0);

  const timeDiff = sessionDateTime.getTime() - now.getTime();
  const minutesDiff = timeDiff / (1000 * 60);

  return minutesDiff <= 15 && minutesDiff >= -60 && this.status === 'scheduled';
};

// Static method to get available slots for a doctor on a specific date
sessionSchema.statics.getAvailableSlots = async function (doctorId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const bookedSessions = await this.find({
    doctorId,
    sessionDate: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    status: { $ne: 'cancelled' }
  }).select('sessionTime duration');

  // Default available slots (9 AM to 6 PM)
  const allSlots = [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00'
  ];

  const bookedTimes = bookedSessions.map(session => session.sessionTime);
  const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));

  return availableSlots;
};

module.exports = mongoose.model('Session', sessionSchema);
