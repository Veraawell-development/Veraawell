/**
 * Task Controller
 * Handles therapeutic task assignment and tracking (Doctor → Patient)
 */

const Task = require('../models/task');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { sealedFilter } = require('../authz');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TASK-CTRL');

/**
 * POST /api/session-tools/tasks
 * Create a task (Doctor only)
 */

const createTask = asyncHandler(async (req, res) => {
  const { title, description, dueDate, priority } = req.body;
  const doctorId = req.actor.id;
  // Server-derived from the authorized session — see authz/policies/clinicalRecords.policy.js
  const { sessionId, patientId } = req.authz.derived;

  const task = new Task({ sessionId, doctorId, patientId, title, description, dueDate: new Date(dueDate), priority: priority || 'medium' });
  await task.save();

  const populatedTask = await Task.findById(task._id)
    .populate('doctorId', 'firstName lastName')
    .populate('patientId', 'firstName lastName');

  logger.info('Task created', { taskId: task._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, message: 'Task created successfully', task: populatedTask });
});

/**
 * GET /api/session-tools/tasks/patient/:patientId
 * Get tasks for a patient
 */
const getTasksByPatient = asyncHandler(async (req, res) => {
  const { status } = req.query;

  // sealedFilter throws if a caller-supplied term would overwrite a key the
  // authorization scope pinned — that is the regression which would silently
  // widen this query back out to another patient's records.
  const query = sealedFilter(req.authz.scope, status ? { status } : {});

  const tasks = await Task.find(query)
    .populate('doctorId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .populate('patientId', 'firstName lastName')
    .sort({ dueDate: 1, createdAt: -1 });

  res.json({ success: true, tasks });
});

/**
 * GET /api/session-tools/tasks/doctor/:doctorId
 * Get all tasks assigned by a doctor
 */
const getTasksByDoctor = asyncHandler(async (req, res) => {
  const tasks = await Task.find(req.authz.scope)
    .populate('patientId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .sort({ createdAt: -1, dueDate: 1 });

  res.json({ success: true, tasks });
});

/**
 * PUT /api/session-tools/tasks/:taskId
 * Update task status (Patient or Doctor)
 */
const updateTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { status, patientNotes } = req.body;

  const task = req.authz.resource;

  if (status) {
    // Patients can toggle a task between pending/completed (the real UI
    // feature in PendingTasksPage.tsx — checking/unchecking a task), but
    // 'in-progress' is a doctor/clinical-workflow state no patient-facing UI
    // ever sends today; there was no server-side check stopping a crafted
    // request from setting it anyway.
    if (req.actor.role === 'patient' && !['pending', 'completed'].includes(status)) {
      throw new AuthorizationError("Patients can only set a task's status to pending or completed");
    }
    task.status = status;
    if (status === 'completed') task.completedAt = new Date();
  }
  if (patientNotes !== undefined) task.patientNotes = patientNotes;

  await task.save();

  const populatedTask = await Task.findById(task._id)
    .populate('doctorId', 'firstName lastName')
    .populate('patientId', 'firstName lastName');

  logger.info('Task updated', { taskId: taskId.substring(0, 8), status });
  res.json({ success: true, message: 'Task updated successfully', task: populatedTask });
});

module.exports = { createTask, getTasksByPatient, getTasksByDoctor, updateTask };
