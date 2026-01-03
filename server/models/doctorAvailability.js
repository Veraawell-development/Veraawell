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
  }],
  // Track booked slots independently of availability settings
  bookedSlots: [{
    date: { type: String, required: true },
    time: { type: String, required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' }
  }]
}, {
  timestamps: true
});

// Index for efficient queries
doctorAvailabilitySchema.index({ doctorId: 1, 'bookedSlots.date': 1 });

// Method to get available slots for a specific date
doctorAvailabilitySchema.methods.getAvailableSlotsForDate = function (dateStr) {
  let slots = [];

  if (this.availabilityType === 'same_slots') {
    // Return default slots ONLY if date is in active dates
    if (this.activeDates && this.activeDates.includes(dateStr)) {
      slots = this.defaultSlots.map(time => ({
        time,
        isBooked: false,
        sessionId: null
      }));
    } else {
      slots = [];
    }
  } else {
    // Find custom availability for the date
    const dayAvailability = this.customAvailability.find(day => day.date === dateStr);
    slots = dayAvailability ? JSON.parse(JSON.stringify(dayAvailability.slots)) : [];
  }

  // Filter out booked slots logic
  // Check against the bookedSlots array
  const bookingsForDate = this.bookedSlots.filter(booking => booking.date === dateStr);

  return slots.map(slot => {
    const isBooked = bookingsForDate.some(booking => booking.time === slot.time);
    return {
      ...slot,
      isBooked: isBooked || slot.isBooked // Check both global booking and specific day slot booking (legacy)
    };
  });
};

// Method to check if a slot is available
doctorAvailabilitySchema.methods.isSlotAvailable = function (dateStr, timeStr) {
  const slots = this.getAvailableSlotsForDate(dateStr);
  const slot = slots.find(s => s.time === timeStr);
  return slot && !slot.isBooked;
};

// Method to book a slot
doctorAvailabilitySchema.methods.bookSlot = async function (dateStr, timeStr, sessionId) {
  // Check if slot exists in configured availability first
  const slots = this.getAvailableSlotsForDate(dateStr);
  const slotExists = slots.some(s => s.time === timeStr);

  if (!slotExists) return false;

  // Check if already booked
  const isAlreadyBooked = this.bookedSlots.some(
    booking => booking.date === dateStr && booking.time === timeStr
  );

  if (isAlreadyBooked) return false;

  // Add to bookedSlots
  this.bookedSlots.push({
    date: dateStr,
    time: timeStr,
    sessionId
  });

  await this.save();
  return true;
};

// Method to release a slot (when session is cancelled)
doctorAvailabilitySchema.methods.releaseSlot = async function (dateStr, timeStr) {
  const initialLength = this.bookedSlots.length;
  this.bookedSlots = this.bookedSlots.filter(
    booking => !(booking.date === dateStr && booking.time === timeStr)
  );

  if (this.bookedSlots.length !== initialLength) {
    await this.save();
    return true;
  }

  return false;
};

module.exports = mongoose.model('DoctorAvailability', doctorAvailabilitySchema);
