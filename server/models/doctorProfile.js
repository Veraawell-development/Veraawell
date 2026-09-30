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
    },
    session20: {
      type: Number,
      default: 0
    },
    session40: {
      type: Number,
      default: 0
    },
    session55: {
      type: Number,
      default: 0
    },
    audio: {
      session20: {
        type: Number,
        default: 0
      },
      session40: {
        type: Number,
        default: 0
      },
      session55: {
        type: Number,
        default: 0
      }
    }
  },
  profileImage: {
    type: String,
    default: '/doctor-placeholder.svg'
  },
  bannerImage: {
    type: String,
    default: '/profile-bg.svg'
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
  },
  // Razorpay Route fields
  razorpayAccountId: {
    type: String,
    default: null
  },
  payoutSetupCompleted: {
    type: Boolean,
    default: false
  },
  customFeePercentage: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  // Onboarding lifecycle tracking
  razorpayOnboardingStatus: {
    type: String,
    enum: ['not_requested', 'pending_admin_approval', 'submitted_to_razorpay', 'active', 'rejected'],
    default: 'not_requested'
  },
  razorpayOnboardingRequestedAt: {
    type: Date,
    default: null
  },
  razorpayActivatedAt: {
    type: Date,
    default: null
  },
  razorpayKYCRejectionReason: {
    type: String,
    default: null
  },
  // ── Payout eligibility ───────────────────────────────────────────────────
  //
  // Replaces `razorpayAccountId` as the gate on whether a doctor can be booked.
  // The old gate asked "does Razorpay know about this doctor", which
  // approveOnboarding could satisfy with a fabricated `acc_mock_…` id — so it
  // answered yes for doctors nobody could actually pay. This asks the question
  // that matters: has an admin seen and approved a way to pay this person.
  //
  // Bank details themselves arrive with the payout work; this flag is the part
  // booking depends on, so it lands first.
  payoutApproved: {
    type: Boolean,
    default: false,
    index: true
  },
  payoutApprovedAt: {
    type: Date,
    default: null
  },
  payoutApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  /**
   * Where to send this practitioner's money.
   *
   * `select: false` on every field: these are the most sensitive values on
   * the model, and the public therapist directory returned
   * `profile.toObject()` unfiltered until very recently. The allowlist in
   * PUBLIC_DOCTOR_FIELDS is the real guard; this is the second one, so that
   * a query written without the allowlist still cannot leak an account
   * number. Reading them requires an explicit `+payoutBank.accountNumber`.
   *
   * Deliberately NOT written by setupProfile or updatePricing — both use
   * explicit $set allowlists, so there is no mass-assignment path from a
   * profile edit into a bank account.
   */
  payoutBank: {
    accountHolderName: { type: String, default: null, select: false },
    accountNumber: { type: String, default: null, select: false },
    ifsc: { type: String, default: null, select: false },
    panNumber: { type: String, default: null, select: false },
    submittedAt: { type: Date, default: null, select: false }
  },
  payoutBankStatus: {
    type: String,
    enum: ['not_submitted', 'pending_admin_approval', 'approved', 'rejected'],
    default: 'not_submitted'
  },
  payoutRejectionReason: { type: String, default: null },

  /**
   * The last date this doctor has published availability for, denormalised
   * from DoctorAvailability.activeDates by saveAvailability.
   *
   * The public directory has to exclude doctors with no future slots — showing
   * a therapist whose calendar ran out is how patients reach a booking page
   * with nothing on it, which is exactly what happened here: both live doctors'
   * activeDates ended six weeks before they were still being listed as
   * bookable.
   *
   * Denormalised rather than joined because availability lives in another
   * collection, and filtering after pagination would silently return short
   * pages. One indexed field keeps the directory a single query.
   */
  bookableUntil: {
    type: Date,
    default: null,
    index: true
  },

  /**
   * The practitioner's drawn signature, as a PNG data URL.
   *
   * Stored as data rather than uploaded to Cloudinary like the profile and
   * banner images. Every Cloudinary asset here is public, unsigned delivery,
   * and a signature is not a profile photo — it is the artifact people read as
   * authorisation. Keeping it in the document means no URL exists to find,
   * share or hotlink; it reaches exactly two places, the doctor's own settings
   * page and the PDF their own reports are rendered into.
   *
   * `select: false`, and deliberately absent from PUBLIC_DOCTOR_FIELDS below —
   * that allowlist is default-deny, so a signature can never be added to a
   * public directory response by forgetting something.
   *
   * A drawn signature trimmed to its ink is on the order of 5-20 KB, well
   * inside the document limit; the endpoint caps it regardless.
   */
  signature: {
    type: String,
    default: null,
    select: false
  },
  signatureUpdatedAt: {
    type: Date,
    default: null
  },

  // Doctor cancellation tracking
  cancellationCount: {
    type: Number,
    default: 0
  },
  lastCancellationDate: {
    type: Date,
    default: null
  },
  cancellationWarningIssued: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// Index for efficient queries
// Note: userId already has unique index from schema definition
doctorProfileSchema.index({ specialization: 1 });
doctorProfileSchema.index({ isOnline: 1 });
doctorProfileSchema.index({ 'rating.average': -1 });
// The public directory predicate, in the order the query uses it.
doctorProfileSchema.index({ payoutApproved: 1, bookableUntil: 1 });

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

/**
 * The only fields any unauthenticated or patient-facing endpoint may return.
 *
 * This exists because `GET /api/sessions/doctors` is a public route that
 * returned `profile.toObject()` — the WHOLE document. Verified against the
 * running server with no credentials: it published `razorpayAccountId`,
 * `customFeePercentage` (the platform's per-doctor commercial terms),
 * `payoutSetupCompleted`, `razorpayOnboardingStatus`,
 * `razorpayKYCRejectionReason`, `cancellationCount` and
 * `cancellationWarningIssued`. `getDoctorById` and `getMyDoctors` did the same.
 *
 * An allowlist rather than a denylist, and declared next to the schema rather
 * than at the call sites, so that adding a sensitive field is safe by default:
 * a new field is invisible publicly until someone deliberately adds its name
 * here. The reverse — remembering to exclude each new secret at three separate
 * call sites — is the arrangement that produced the leak.
 *
 * Derived from what the UI actually reads: the `Doctor` interface in
 * client/src/types/index.ts, plus bannerImage/type/quote/quoteAuthor used by
 * the profile page. `rating` is attached by the controllers from a live Review
 * aggregation, not read from this document.
 */
const PUBLIC_DOCTOR_FIELDS = [
  'userId', 'specialization', 'experience', 'qualification', 'languages',
  'treatsFor', 'pricing', 'profileImage', 'bannerImage', 'bio', 'type',
  'modeOfSession', 'quote', 'quoteAuthor', 'isOnline', 'rating'
].join(' ');

/**
 * Changing bank details revokes approval.
 *
 * Without this: a doctor is approved, then edits the account number, and the
 * next payout goes to an account no admin ever saw. Enforced in a hook rather
 * than at the call site for the same reason the Session time fields are
 * derived in one — so the next code path that writes these cannot forget.
 */
doctorProfileSchema.pre('validate', function resetApprovalOnBankChange(next) {
  if (!this.isNew && this.isModified('payoutBank')) {
    this.payoutApproved = false;
    this.payoutApprovedAt = null;
    this.payoutBankStatus = 'pending_admin_approval';
  }
  next();
});

const DoctorProfile = mongoose.model('DoctorProfile', doctorProfileSchema);

module.exports = DoctorProfile;
module.exports.PUBLIC_DOCTOR_FIELDS = PUBLIC_DOCTOR_FIELDS;
