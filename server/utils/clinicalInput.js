/**
 * What a therapist may file as a note, task or report.
 *
 * The three create endpoints passed the body straight to the model: no
 * length limits (a megabyte "note" was accepted), a task with an unparseable
 * due date failed deep in Mongoose as a bare "Validation failed", and a due
 * date in the past was accepted and shown to the patient as overdue on day
 * one. One small checker per record, returning a message a person can act on.
 */

const { utcToZoned, zonedToUtc } = require('./zonedTime');
const { PLATFORM_TIMEZONE } = require('../config/time');

const LIMITS = { short: 200, field: 5000, report: 20000 };
const REPORT_TYPES = ['assessment', 'progress', 'diagnosis', 'treatment-plan', 'discharge', 'other'];
const PRIORITIES = ['low', 'medium', 'high'];

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const tooLong = (v, max) => typeof v === 'string' && v.length > max;

/** @returns {{ error?: string, value?: object }} */
function checkNote(body = {}) {
  const fields = ['content', 'mood', 'topicsDiscussed', 'progressInsights', 'therapeuticTechniques'];
  for (const f of fields) {
    if (body[f] !== undefined && body[f] !== null && typeof body[f] !== 'string') return { error: 'Notes must be text.' };
    if (tooLong(body[f], f === 'mood' ? LIMITS.short : LIMITS.field)) return { error: 'This note is too long — please shorten it.' };
  }
  const value = Object.fromEntries(fields.map((f) => [f, text(body[f])]));
  if (!fields.some((f) => value[f])) return { error: 'Write something before saving the note.' };
  // The model requires `content`; a note with only the structured fields is fine.
  if (!value.content) value.content = [value.topicsDiscussed, value.progressInsights, value.therapeuticTechniques].filter(Boolean).join('\n');
  return { value };
}

/** A due date: a real IST calendar day from today to a year ahead. */
function checkTask(body, { now = new Date() } = {}) {
  const title = text(body.title);
  const description = text(body.description);
  if (!title || !description) return { error: 'Give the task a title and say what to do.' };
  if (title.length > LIMITS.short) return { error: 'Please keep the title under 200 characters.' };
  if (description.length > LIMITS.field) return { error: 'Please keep the description under 5000 characters.' };
  const priority = body.priority === undefined ? 'medium' : body.priority;
  if (!PRIORITIES.includes(priority)) return { error: 'Priority must be low, medium or high.' };

  const raw = typeof body.dueDate === 'string' ? body.dueDate.trim() : '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : (raw && !Number.isNaN(Date.parse(raw)) ? utcToZoned(new Date(raw), PLATFORM_TIMEZONE).localDate : null);
  if (!day) return { error: 'Choose a due date.' };
  let dueDate;
  try {
    dueDate = zonedToUtc(day, '00:00', PLATFORM_TIMEZONE);
  } catch {
    return { error: 'Choose a due date.' };
  }
  const today = utcToZoned(now, PLATFORM_TIMEZONE).localDate;
  if (day < today) return { error: 'The due date has already passed.' };
  if (dueDate.getTime() - now.getTime() > 366 * 24 * 3600 * 1000) return { error: 'Choose a due date within a year.' };
  return { value: { title, description, priority, dueDate } };
}

function checkReport(body) {
  const title = text(body.title);
  if (!title) return { error: 'The report needs a title.' };
  if (title.length > LIMITS.short) return { error: 'Please keep the title under 200 characters.' };
  if (!REPORT_TYPES.includes(body.reportType)) return { error: 'Choose a report type.' };
  if (typeof body.content !== 'string' || !body.content.trim()) return { error: 'The report is empty.' };
  if (body.content.length > LIMITS.report) return { error: 'This report is too long — please shorten it.' };
  if (body.isSharedWithPatient !== undefined && typeof body.isSharedWithPatient !== 'boolean') return { error: 'Say whether to share the report.' };
  return { value: { title, reportType: body.reportType, content: body.content, isSharedWithPatient: body.isSharedWithPatient !== false } };
}

module.exports = { checkNote, checkTask, checkReport, LIMITS };
