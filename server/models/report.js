const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  reportType: {
    type: String,
    enum: ['assessment', 'progress', 'diagnosis', 'treatment-plan', 'discharge', 'other'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    default: null // For uploaded PDF/documents
  },
  fileName: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: null
  },
  /**
   * The practitioner's signature AS IT WAS when this report was filed.
   *
   * A snapshot, not a join to DoctorProfile.signature, for the same reason the
   * commission split is snapshotted onto a Session: a clinical record must
   * keep saying what it said when it was signed. A doctor who redraws their
   * signature next year has not re-signed every report they ever filed, and
   * a join would silently rewrite all of them.
   *
   * It also means the patient's copy carries the signature without the
   * signature field itself ever having to leave DoctorProfile, where it is
   * select:false and doctor-only.
   */
  doctorSignature: {
    type: String,
    default: null
  },

  isSharedWithPatient: {
    type: Boolean,
    default: true
  },
  viewedByPatient: {
    type: Boolean,
    default: false
  },
  viewedAt: {
    type: Date,
    default: null
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

// Index for efficient queries
reportSchema.index({ sessionId: 1 });
reportSchema.index({ patientId: 1, isSharedWithPatient: 1, createdAt: -1 });
reportSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
