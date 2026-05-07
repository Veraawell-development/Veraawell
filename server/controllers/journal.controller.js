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
  const patientId = req.user._id.toString();

  if (req.user.role !== 'patient') throw new AuthorizationError('Only patients can create journal entries');

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
  const userId = req.user._id.toString();

  if (userId !== patientId) throw new AuthorizationError('Unauthorized');

  const journals = await Journal.find({ patientId }).sort({ createdAt: -1 });
  res.json({ success: true, journals });
});

/**
 * PUT /api/session-tools/journal/:journalId
 * Update a journal entry (owner only)
 */
const updateEntry = asyncHandler(async (req, res) => {
  const { journalId } = req.params;
  const { title, content, mood, tags } = req.body;
  const userId = req.user._id.toString();

  const journal = await Journal.findById(journalId);
  if (!journal) throw new NotFoundError('Journal entry');
  if (journal.patientId.toString() !== userId) throw new AuthorizationError('Unauthorized');

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
  const userId = req.user._id.toString();

  const journal = await Journal.findById(journalId);
  if (!journal) throw new NotFoundError('Journal entry');
  if (journal.patientId.toString() !== userId) throw new AuthorizationError('Unauthorized');

  await Journal.findByIdAndDelete(journalId);

  logger.info('Journal entry deleted', { entryId: journalId.substring(0, 8) });
  res.json({ success: true, message: 'Journal entry deleted successfully' });
});

module.exports = { createEntry, getEntriesByPatient, updateEntry, deleteEntry };
