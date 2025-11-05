const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema({
  time: {
    type: String,
    required: true // Format: "09:00 AM", "03:00 PM"
  },
  isBooked: {
    type: Boolean,
    default: false
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    default: null
  }
});

const availabilityDaySchema = new mongoose.Schema({
  date: {
    type: String,
    required: true // Format: "YYYY-MM-DD"
  },
  slots: [timeSlotSchema]
});

const doctorAvailabilitySchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  availabilityType: {
    type: String,
    enum: ['same_slots', 'different_slots'],
    default: 'same_slots'
  },
  // For "same slots for each day" option
  defaultSlots: [{
    type: String // e.g., ["09:00 AM", "11:00 AM", "03:00 PM"]
  }],
  // For "different slots for each day" option
  customAvailability: [availabilityDaySchema],
  // Active date range
  activeDates: [{
    type: String // Array of dates in "YYYY-MM-DD" format
  }]
}, {
  timestamps: true
});

// Index for efficient queries
doctorAvailabilitySchema.index({ doctorId: 1, 'customAvailability.date': 1 });

// Method to get available slots for a specific date
doctorAvailabilitySchema.methods.getAvailableSlotsForDate = function(dateStr) {
  if (this.availabilityType === 'same_slots') {
    // Return default slots if date is in active dates
    if (this.activeDates.includes(dateStr)) {
      return this.defaultSlots.map(time => ({
        time,
        isBooked: false,
        sessionId: null
      }));
    }
    return [];
  } else {
    // Find custom availability for the date
    const dayAvailability = this.customAvailability.find(day => day.date === dateStr);
    return dayAvailability ? dayAvailability.slots : [];
  }
};

// Method to check if a slot is available
doctorAvailabilitySchema.methods.isSlotAvailable = function(dateStr, timeStr) {
  const slots = this.getAvailableSlotsForDate(dateStr);
  const slot = slots.find(s => s.time === timeStr);
  return slot && !slot.isBooked;
};

// Method to book a slot
doctorAvailabilitySchema.methods.bookSlot = async function(dateStr, timeStr, sessionId) {
  if (this.availabilityType === 'different_slots') {
    const dayAvailability = this.customAvailability.find(day => day.date === dateStr);
    if (dayAvailability) {
      const slot = dayAvailability.slots.find(s => s.time === timeStr);
      if (slot && !slot.isBooked) {
        slot.isBooked = true;
        slot.sessionId = sessionId;
        await this.save();
        return true;
      }
    }
  }
  return false;
};

// Method to release a slot (when session is cancelled)
doctorAvailabilitySchema.methods.releaseSlot = async function(dateStr, timeStr) {
  if (this.availabilityType === 'different_slots') {
    const dayAvailability = this.customAvailability.find(day => day.date === dateStr);
    if (dayAvailability) {
      const slot = dayAvailability.slots.find(s => s.time === timeStr);
      if (slot) {
        slot.isBooked = false;
        slot.sessionId = null;
        await this.save();
        return true;
      }
    }
  }
  return false;
};

module.exports = mongoose.model('DoctorAvailability', doctorAvailabilitySchema);
