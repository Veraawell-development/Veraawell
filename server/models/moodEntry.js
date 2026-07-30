const mongoose = require('mongoose');

const MOOD_LABELS = ['Struggling', 'Low', 'Okay', 'Good', 'Great'];

const moodEntrySchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    // Patient's local calendar day, "YYYY-MM-DD" — enforces one entry per day
    type: String,
    required: true
  },
  mood: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  label: {
    type: String,
    enum: MOOD_LABELS,
    required: true
  },
  note: {
    type: String,
    default: '',
    maxlength: 280
  }
}, {
  timestamps: true
});

moodEntrySchema.index({ patientId: 1, date: 1 }, { unique: true });

moodEntrySchema.statics.MOOD_LABELS = MOOD_LABELS;

module.exports = mongoose.model('MoodEntry', moodEntrySchema);
