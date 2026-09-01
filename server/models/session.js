const mongoose = require('mongoose');
const { PLATFORM_TIMEZONE } = require('../config/time');

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
  // ── Time ───────────────────────────────────────────────────────────────
  //
  // `startsAt` is the authoritative instant. Everything time-dependent —
  // refund tiers, the join window, the no-show sweep, reminders — is computed
  // from it via services/sessionTime.js.
  //
  // It exists because (sessionDate, sessionTime) could not answer "when is
  // this, exactly": sessionDate was a UTC midnight and sessionTime a bare
  // string in two different formats, so every consumer re-derived an instant
  // with `setHours`, which applies the SERVER's offset. On a UTC host that put
  // every IST booking 5h30m out.
  //
  // `localDate`/`localTime` are kept alongside because they, not the instant,
  // are the identity of a slot in DoctorAvailability, and because they
  // preserve the booking's intent independently of any tz-database revision.
  startsAt: {
    type: Date,
    index: true
  },
  endsAt: {
    type: Date,
    index: true
  },
  /** IANA zone the slot was published in — the doctor's, not the patient's. */
  timezone: {
    type: String,
    default: PLATFORM_TIMEZONE
  },
  /** 'YYYY-MM-DD' in `timezone`. */
  localDate: {
    type: String,
    index: true
  },
  /** 'HH:mm' (24h) in `timezone`. */
  localTime: {
    type: String
  },
  /**
   * How confident the backfill was about this row's instant, for rows that
   * predate `startsAt`. 'low' means the time string was unparseable and the
   * stored date was used as-is — those rows are terminal (completed/cancelled/
   * no-show), never live, because the migration refuses to guess a live
   * session's time. Set only by migrations/backfillSessionStartsAt.js.
   */
  dateBackfillConfidence: {
    type: String,
    enum: ['high', 'medium', 'low', null],
    default: null
  },

  // Legacy display fields. Derived from startsAt by the pre-save hook below
  // and kept for one release so old clients keep working; do not read them in
  // new code.
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
    enum: ['payment_pending', 'scheduled', 'active', 'completed', 'cancelled', 'no-show'],
    default: 'scheduled'
  },
  acceptanceStatus: {
    type: String,
    enum: ['pending', 'accepted', 'delayed'],
    default: 'pending'
  },
  delayMinutes: {
    type: Number,
    default: 0
  },
  delayedUntil: {
    type: Date,
    default: null
  },
  doctorNote: {
    type: String,
    default: ''
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
    enum: ['pending', 'paid', 'refunded', 'refund_pending', 'refund_failed', 'failed', 'not_required'],
    default: 'pending'
  },
  paymentId: {
    type: String,
    default: null
  },
  platformFee: {
    type: Number,
    default: 0
  },
  doctorEarnings: {
    type: Number,
    default: 0
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayTransferId: {
    type: String,
    default: null
  },
  // Refund tracking
  refundId: {
    type: String,
    default: null
  },
  refundedAt: {
    type: Date,
    default: null
  },
  refundAmount: {
    type: Number,
    default: 0
  },
  cancelledBy: {
    type: String,
    enum: ['patient', 'doctor', 'admin', 'system'],
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
    enum: ['not-started', 'in-progress', 'completed', 'failed', 'paused'],
    default: 'not-started'
  },
  callMode: {
    type: String,
    enum: ['Video Calling', 'Voice Calling', 'Cancelled & Refunded'],
    default: 'Video Calling'
  },
  postSessionReportCompleted: {
    type: Boolean,
    default: false
  },
  postSessionReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    default: null
  },
  rating: {
    score: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    review: {
      type: String,
      maxlength: 500,
      default: ''
    },
    ratedAt: {
      type: Date,
      default: null
    }
  },
  notificationStatus: {
    reminderSent: {
      type: Boolean,
      default: false
    },
    startSent: {
      type: Boolean,
      default: false
    },
    lateSent: {
      type: Boolean,
      default: false
    }
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
// The sweeps query by instant, not by calendar day: "every live session whose
// end time has passed" is one indexed range scan instead of loading a day's
// worth of rows and re-deriving each one's end time in JavaScript.
sessionSchema.index({ status: 1, endsAt: 1 });
sessionSchema.index({ startsAt: 1, status: 1 });
sessionSchema.index({ doctorId: 1, startsAt: 1 });

/**
 * Keep every time representation derived from the one authoritative instant.
 *
 * Without this the fields drift: bookImmediate wrote a 24-hour sessionTime
 * from getUTCHours() while the availability grid used 12-hour strings, so a
 * slot booked by one path could never be matched — and released — by the
 * other.
 */
sessionSchema.pre('validate', function deriveTimeFields(next) {
  const { deriveFields, resolveStartsAt } = require('../services/sessionTime');
  try {
    // If startsAt is absent (a legacy document, or a caller still writing the
    // old fields), derive it once from what is there.
    const startsAt = this.startsAt || resolveStartsAt(this);
    Object.assign(this, deriveFields(startsAt, this.duration || 60, this.timezone || PLATFORM_TIMEZONE));
    next();
  } catch (err) {
    next(err);
  }
});

/** Displayed end time, in the session's own zone. */
sessionSchema.virtual('sessionEndTime').get(function () {
  const { resolveEndsAt } = require('../services/sessionTime');
  const { formatTimeForDisplay } = require('../utils/zonedTime');
  return formatTimeForDisplay(resolveEndsAt(this), this.timezone || PLATFORM_TIMEZONE);
});

sessionSchema.methods.isUpcoming = function () {
  const { resolveStartsAt } = require('../services/sessionTime');
  return resolveStartsAt(this) > new Date() && this.status === 'scheduled';
};

/**
 * Joinable from JOIN_LEAD_MINUTES before the start until JOIN_GRACE_MINUTES
 * after the end. The 15/-60 minute literals used to live here, applied to a
 * server-local reinterpretation of the stored date.
 */
sessionSchema.methods.canJoin = function () {
  const { isWithinJoinWindow } = require('../services/sessionTime');
  return isWithinJoinWindow(this) && ['scheduled', 'active'].includes(this.status);
};

// Removed: a `getAvailableSlots` static that hardcoded a 24-hour slot list
// ('09:00'...'18:00'). It had no callers anywhere in the codebase and its
// format contradicted the 12-hour grid DoctorAvailability actually uses, so
// anything that did adopt it would have produced slots that never matched.

// Compound Indexes for Performance Optimization
sessionSchema.index({ patientId: 1, sessionDate: -1, sessionTime: -1 });
sessionSchema.index({ doctorId: 1, status: 1, sessionDate: -1 });
// { status: 1, callStatus: 1 } was declared twice (also at line ~204) — Mongoose
// warns on the duplicate at startup; removed the redundant second copy.

module.exports = mongoose.model('Session', sessionSchema);

