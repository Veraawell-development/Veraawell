/**
 * Enquiry Controller
 *
 * Backs the three inbound-contact surfaces the product advertises: the
 * "Partner with us" and "Other Queries" tabs on the careers page, and the
 * /contact form. All three post the same shape and differ only by `type`.
 *
 * There is no notification email — enquiries are read from the Super Admin
 * dashboard. Nothing in the codebase configures an internal recipient
 * address, so inventing one here would send mail into a void.
 */

const Enquiry = require('../models/enquiry');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const DOMPurify = require('isomorphic-dompurify');

const logger = createLogger('ENQUIRY-CTRL');

/**
 * Strip every tag from a free-text field. This text is rendered in the admin
 * dashboard, so an enquiry is a stored-XSS vector if it is persisted raw.
 * Matches article.controller.js's treatment of its plain-text fields.
 */
const clean = (value) => (
  value === undefined || value === null
    ? undefined
    : DOMPurify.sanitize(String(value), { ALLOWED_TAGS: [] }).trim()
);

/** POST /api/enquiries — Submit an enquiry (public) */
const submitEnquiry = asyncHandler(async (req, res) => {
  const { type, name, email, phone, organisation, subject, message } = req.body;

  const enquiry = await Enquiry.create({
    type,
    name: clean(name),
    email: clean(email).toLowerCase(),
    phone: clean(phone) || undefined,
    organisation: clean(organisation) || undefined,
    subject: clean(subject) || undefined,
    message: clean(message)
  });

  logger.info('Enquiry received', { id: enquiry._id.toString(), type: enquiry.type });

  // Deliberately thin: an anonymous caller learns that it was stored and
  // nothing else about what is stored.
  res.status(201).json({
    success: true,
    message: 'Thank you — your enquiry has been received. We will be in touch shortly.',
    data: { id: enquiry._id, type: enquiry.type }
  });
});

/** GET /api/enquiries — List enquiries (super admin) */
const listEnquiries = asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

  const filter = {};
  if (status && ['new', 'in_progress', 'closed'].includes(status)) filter.status = status;
  if (type && ['partner', 'other', 'contact'].includes(type)) filter.type = type;

  const [enquiries, total, newCount] = await Promise.all([
    Enquiry.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('handledBy', 'name email')
      .lean(),
    Enquiry.countDocuments(filter),
    Enquiry.countDocuments({ status: 'new' })
  ]);

  res.json({
    success: true,
    data: {
      enquiries,
      newCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
    }
  });
});

/** PATCH /api/enquiries/:id — Update status / notes (super admin) */
const updateEnquiry = asyncHandler(async (req, res) => {
  const { status, adminNotes } = req.body;

  if (status === undefined && adminNotes === undefined) {
    throw new ValidationError('Validation failed', { status: 'Provide a status or admin notes to update' });
  }
  if (status !== undefined && !['new', 'in_progress', 'closed'].includes(status)) {
    throw new ValidationError('Validation failed', { status: 'Status must be one of: new, in_progress, closed' });
  }

  const update = {};
  if (status !== undefined) {
    update.status = status;
    // Record who moved it off "new" and when, so the queue has an audit trail.
    update.handledBy = req.actor.id;
    update.handledAt = new Date();
  }
  if (adminNotes !== undefined) update.adminNotes = clean(adminNotes);

  const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
    .populate('handledBy', 'name email');

  if (!enquiry) throw new NotFoundError('Enquiry');

  logger.info('Enquiry updated', { id: enquiry._id.toString(), status: enquiry.status });
  res.json({ success: true, data: enquiry });
});

module.exports = { submitEnquiry, listEnquiries, updateEnquiry };
