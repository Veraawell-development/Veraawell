/**
 * Mood Entry Controller
 * Handles the patient's daily mood check-in
 */

const MoodEntry = require('../models/moodEntry');
const { asyncHandler } = require('../middleware/error.middleware');
const { AuthorizationError, ValidationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('MOOD-CTRL');

// Patient-local "today" — pinned to IST so the daily check-in resets at
// midnight India time regardless of the server's own timezone.
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/**
 * GET /api/session-tools/mood/today
 * Whether the logged-in patient has already logged a mood today
 */
const getToday = asyncHandler(async (req, res) => {
  const date = todayIST();
  const entry = await MoodEntry.findOne({ patientId: req.actor.id, date });
  res.json({ success: true, hasLoggedToday: !!entry, entry: entry || null, date });
});

/**
 * POST /api/session-tools/mood
 * Log today's mood (one entry per patient per day)
 */
const createEntry = asyncHandler(async (req, res) => {
  const { mood, note } = req.body;
  const moodValue = Number(mood);

  if (!Number.isInteger(moodValue) || moodValue < 1 || moodValue > 5) {
    throw new ValidationError('mood must be an integer between 1 and 5');
  }

  const date = todayIST();
  const label = MoodEntry.MOOD_LABELS[moodValue - 1];

  // Allow correcting today's entry (e.g. re-opened from the dashboard) rather than
  // silently ignoring the new value once today's row already exists.
  const entry = await MoodEntry.findOneAndUpdate(
    { patientId: req.actor.id, date },
    { $set: { mood: moodValue, label, note: note || '' }, $setOnInsert: { patientId: req.actor.id, date } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info('Mood entry logged', { patientId: req.actor.id.toString().substring(0, 8), date, mood: moodValue });
  res.status(201).json({ success: true, entry });
});

/**
 * GET /api/session-tools/mood/history?days=30
 * Recent mood entries for trend display
 */
const getHistory = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90);
  const entries = await MoodEntry.find({ patientId: req.actor.id })
    .sort({ date: -1 })
    .limit(days);

  res.json({ success: true, entries });
});

module.exports = { getToday, createEntry, getHistory };
