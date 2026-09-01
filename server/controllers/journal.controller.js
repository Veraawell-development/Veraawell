/**
 * Journal Controller
 * Handles patient journal entries — private wellness journaling
 */

const Journal = require('../models/journal');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('JOURNAL-CTRL');

/**
 * POST /api/session-tools/journal
 * Create a journal entry (Patient only)
 */
const createEntry = asyncHandler(async (req, res) => {
  const { title, content, mood, tags } = req.body;
  // requireRole('patient') is declared on the route.
  const patientId = req.actor.id;

  const journal = new Journal({ patientId, title, content, mood, tags: tags || [] });
  await journal.save();

  logger.info('Journal entry created', { entryId: journal._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, message: 'Journal entry created successfully', journal });
});

/**
 * GET /api/session-tools/journal/patient/:patientId
 * Get all journal entries for a patient (owner only)
 */
const getEntriesByPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;

  // Unbounded before this — a long-term patient journaling regularly for
  // years returned their entire history on every page load. The supporting
  // index ({patientId:1, createdAt:-1}) was already in place, just unused.
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const journals = await Journal.find({ patientId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  res.json({ success: true, journals, page, limit });
});

/**
 * PUT /api/session-tools/journal/:journalId
 * Update a journal entry (owner only)
 */
const updateEntry = asyncHandler(async (req, res) => {
  const { journalId } = req.params;
  const { title, content, mood, tags } = req.body;

  const journal = req.authz.resource;

  if (title) journal.title = title;
  if (content) journal.content = content;
  if (mood !== undefined) journal.mood = mood;
  if (tags) journal.tags = tags;

  await journal.save();

  logger.info('Journal entry updated', { entryId: journalId.substring(0, 8) });
  res.json({ success: true, message: 'Journal entry updated successfully', journal });
});

/**
 * DELETE /api/session-tools/journal/:journalId
 * Delete a journal entry (owner only)
 */
const deleteEntry = asyncHandler(async (req, res) => {
  const { journalId } = req.params;

  // authorize('journal:delete') already loaded and ownership-checked it.
  await Journal.findByIdAndDelete(journalId);

  logger.info('Journal entry deleted', { entryId: journalId.substring(0, 8) });
  res.json({ success: true, message: 'Journal entry deleted successfully' });
});

module.exports = { createEntry, getEntriesByPatient, updateEntry, deleteEntry };
