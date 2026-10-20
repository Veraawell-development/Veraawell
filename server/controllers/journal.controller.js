/**
 * Journal Controller
 * Handles patient journal entries — private wellness journaling
 */

const Journal = require('../models/journal');
const { asyncHandler } = require('../middleware/error.middleware');
const { ValidationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('JOURNAL-CTRL');

const LIMITS = { title: 200, content: 20000, mood: 50, tags: 20, tag: 40 };

/**
 * The fields of an entry, trimmed and checked. `partial` (an edit) only
 * checks the fields that were sent. Nothing bounded the size before — one
 * entry could be the whole 1 MB request body — and a title of spaces was a
 * valid title.
 */
function readEntry(body, { partial = false } = {}) {
  const out = {};
  for (const field of ['title', 'content']) {
    const value = body[field];
    if (value === undefined && partial) continue;
    if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`Please write a ${field}`);
    if (value.trim().length > LIMITS[field]) throw new ValidationError(`The ${field} can be at most ${LIMITS[field]} characters`);
    out[field] = field === 'title' ? value.trim() : value.replace(/\s+$/, '');
  }
  if (body.mood !== undefined && body.mood !== null) {
    if (typeof body.mood !== 'string' || body.mood.trim().length > LIMITS.mood) throw new ValidationError(`The mood can be at most ${LIMITS.mood} characters`);
    out.mood = body.mood.trim();
  }
  if (body.tags !== undefined && body.tags !== null) {
    const ok = Array.isArray(body.tags) && body.tags.length <= LIMITS.tags
      && body.tags.every((t) => typeof t === 'string' && t.trim().length <= LIMITS.tag);
    if (!ok) throw new ValidationError(`Tags must be at most ${LIMITS.tags} words of up to ${LIMITS.tag} characters`);
    out.tags = body.tags.map((t) => t.trim()).filter(Boolean);
  }
  return out;
}

/**
 * POST /api/session-tools/journal
 * Create a journal entry (Patient only)
 */
const createEntry = asyncHandler(async (req, res) => {
  const { title, content, mood, tags } = readEntry(req.body || {});
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
  // One extra row is read to tell the page whether there are older entries
  // ("Load older"); without it the 20 newest were all a patient could see.
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const rows = await Journal.find({ patientId })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  res.json({ success: true, journals: rows.slice(0, limit), page, limit, hasMore });
});

/**
 * PUT /api/session-tools/journal/:journalId
 * Update a journal entry (owner only)
 */
const updateEntry = asyncHandler(async (req, res) => {
  const { journalId } = req.params;
  const changes = readEntry(req.body || {}, { partial: true });

  const journal = req.authz.resource;
  Object.assign(journal, changes);

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
