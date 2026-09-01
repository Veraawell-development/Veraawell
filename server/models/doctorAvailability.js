const mongoose = require('mongoose');
const { slotKey, normalizeTimeTo24h, to12hSlot, normalizeDate } = require('../utils/zonedTime');
const { PLATFORM_TIMEZONE } = require('../config/time');

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
  /** IANA zone the slot strings above are expressed in. */
  timezone: { type: String, default: PLATFORM_TIMEZONE },

  // Track booked slots independently of availability settings.
  //
  // `slotKey` is the ONLY basis for comparison. Identity used to be a raw
  // `===` on a formatted time string, in five separate places, while three
  // different producers emitted three formats ('09:00 AM' from the grid,
  // '14:30' from bookImmediate, '9:00 AM' from hand-entered data). Any skew
  // meant releaseSlot silently matched nothing and the slot stayed booked
  // forever, with no error anywhere.
  bookedSlots: [{
    date: { type: String, required: true },   // 'YYYY-MM-DD', display form
    time: { type: String, required: true },   // 'hh:mm A', display form
    slotKey: { type: String, required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' }
  }]
}, {
  timestamps: true
});

// Index for efficient queries
doctorAvailabilitySchema.index({ doctorId: 1, 'bookedSlots.date': 1 });
doctorAvailabilitySchema.index({ doctorId: 1, 'bookedSlots.slotKey': 1 });

/**
 * Canonicalise every configured slot string on write.
 *
 * Without this, a doctor (or a client bug) can store an unparseable time that
 * only fails much later, inside whatever code next tries to read it — which is
 * how '0900' reached parseTime and threw a TypeError as a 500.
 */
doctorAvailabilitySchema.pre('validate', function normaliseSlots(next) {
  try {
    if (Array.isArray(this.defaultSlots)) {
      this.defaultSlots = this.defaultSlots.map((t) => to12hSlot(normalizeTimeTo24h(t)));
    }
    if (Array.isArray(this.customAvailability)) {
      for (const day of this.customAvailability) {
        if (day && day.date) day.date = normalizeDate(day.date);
        if (day && Array.isArray(day.slots)) {
          for (const slot of day.slots) {
            if (slot && slot.time) slot.time = to12hSlot(normalizeTimeTo24h(slot.time));
          }
        }
      }
    }
    if (Array.isArray(this.activeDates)) {
      this.activeDates = this.activeDates.map((d) => normalizeDate(d));
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Method to get available slots for a specific date
doctorAvailabilitySchema.methods.getAvailableSlotsForDate = function (dateStr) {
  let slots = [];

  // First check if there is a custom override for this specific date
  const dayAvailability = this.customAvailability.find(day => day.date === dateStr);

  if (dayAvailability && dayAvailability.slots.length > 0) {
    // If a custom override exists and has slots, use those slots
    slots = JSON.parse(JSON.stringify(dayAvailability.slots));
  } else if (this.activeDates && this.activeDates.includes(dateStr)) {
    // Fall back to default slots if date is in activeDates and no override exists
    slots = this.defaultSlots.map(time => ({
      time,
      isBooked: false,
      sessionId: null
    }));
  }

  // Compare on slotKey, never on the raw formatted string — see the schema
  // comment on bookedSlots.
  const bookedKeys = new Set(
    this.bookedSlots
      .map((b) => b.slotKey || safeSlotKey(b.date, b.time))
      .filter(Boolean)
  );

  return slots.map(slot => {
    let key = null;
    try { key = slotKey(dateStr, slot.time); } catch (e) { key = null; }
    return {
      ...slot,
      isBooked: (key && bookedKeys.has(key)) || slot.isBooked
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
//
// This used to be a plain read-check-push-save: check `this.bookedSlots` in
// memory, push if not already there, then `.save()`. That's a classic
// read-modify-write race — two concurrent bookings for the same doctor+
// date+time can both pass the in-memory check before either has saved,
// double-booking the slot, and the README's "Atomic Insert Session" claim
// didn't actually hold. This now does the check-and-set as a single atomic
// MongoDB operation: the update only applies if no existing array element
// already matches this date+time, so a losing concurrent call gets a clean
// `false` back instead of racing.
doctorAvailabilitySchema.methods.bookSlot = async function (dateStr, timeStr, sessionId) {
  const key = safeSlotKey(dateStr, timeStr);
  if (!key) return false;

  // Check if slot exists in configured availability first — this isn't
  // concurrency-sensitive (a doctor's configured slots don't change mid-race).
  // Matched on slotKey so a 24-hour request can book a 12-hour grid slot.
  const slots = this.getAvailableSlotsForDate(dateStr);
  const slotExists = slots.some(s => safeSlotKey(dateStr, s.time) === key);
  if (!slotExists) return false;

  const updated = await this.constructor.findOneAndUpdate(
    {
      _id: this._id,
      bookedSlots: { $not: { $elemMatch: { slotKey: key } } }
    },
    {
      $push: {
        bookedSlots: {
          date: normalizeDate(dateStr),
          time: to12hSlot(normalizeTimeTo24h(timeStr)),
          slotKey: key,
          sessionId
        }
      }
    },
    { new: true }
  );

  if (!updated) return false; // already booked by a concurrent request

  // Keep the in-memory document consistent for any code that reads `this`
  // (e.g. the same instance) after calling bookSlot.
  this.bookedSlots = updated.bookedSlots;
  return true;
};

/**
 * Release a booked slot.
 *
 * Two changes from the previous version, both of which were real defects:
 *
 *  - It was a read-filter-save, so a concurrent booking of the same slot
 *    between the read and the save was silently clobbered. Now a single atomic
 *    $pull, matching bookSlot's own idiom.
 *  - Scoping by `sessionId` when it is known stops a late cancellation from
 *    releasing somebody ELSE's rebooking of the same slot — the second half of
 *    the cleanup race, where an expired checkout freed a slot another patient
 *    had already taken.
 *
 * @returns {Promise<boolean>} false if nothing matched. CALLERS MUST CHECK:
 *   every previous caller discarded this, which is how leaked slots went
 *   unnoticed.
 */
doctorAvailabilitySchema.methods.releaseSlot = async function (dateStr, timeStr, sessionId = null) {
  const key = safeSlotKey(dateStr, timeStr);
  if (!key) return false;

  const match = sessionId ? { slotKey: key, sessionId } : { slotKey: key };
  const updated = await this.constructor.findOneAndUpdate(
    { _id: this._id, bookedSlots: { $elemMatch: match } },
    { $pull: { bookedSlots: match } },
    { new: true }
  );

  if (!updated) return false;
  this.bookedSlots = updated.bookedSlots;
  return true;
};

/** slotKey that returns null instead of throwing, for legacy rows. */
function safeSlotKey(dateStr, timeStr) {
  try {
    return slotKey(dateStr, timeStr);
  } catch (e) {
    return null;
  }
}

module.exports = mongoose.model('DoctorAvailability', doctorAvailabilitySchema);
