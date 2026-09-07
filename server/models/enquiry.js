const mongoose = require('mongoose');

/**
 * Inbound enquiries from the public site.
 *
 * Three entry points share this one shape, distinguished by `type`:
 *   - 'partner'  — the "Partner with us" tab on /careers
 *   - 'other'    — the "Other Queries" tab on /careers
 *   - 'contact'  — the /contact form
 *
 * All three previously went nowhere: the two careers tabs rendered a
 * "coming soon" panel with a mailto: link, and /contact showed a success
 * toast without making any request at all. The record here IS the delivery —
 * there is deliberately no notification email, so a mail outage cannot lose
 * an enquiry.
 */
const enquirySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['partner', 'other', 'contact'],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 200
  },
  // Collected for 'partner' only; optional everywhere else.
  phone: {
    type: String,
    trim: true,
    default: '',
    maxlength: 32
  },
  organisation: {
    type: String,
    trim: true,
    default: '',
    maxlength: 160
  },
  subject: {
    type: String,
    trim: true,
    default: '',
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 4000
  },

  // ── Triage, mirroring the moderation fields on models/review.js ──────────
  status: {
    type: String,
    enum: ['new', 'in_progress', 'closed'],
    default: 'new'
  },
  adminNotes: {
    type: String,
    trim: true,
    default: ''
  },
  handledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  handledAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// The admin list is "newest first, optionally filtered by status".
enquirySchema.index({ status: 1, createdAt: -1 });
enquirySchema.index({ type: 1, createdAt: -1 });

const Enquiry = mongoose.model('Enquiry', enquirySchema);

module.exports = Enquiry;
