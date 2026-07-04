/**
 * Task Controller
 * Handles therapeutic task assignment and tracking (Doctor → Patient)
 */

const Task = require('../models/task');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TASK-CTRL');

/**
 * POST /api/session-tools/tasks
 * Create a task (Doctor only)
 */

const createTask = asyncHandler(async (req, res) => {
  const { sessionId, patientId, title, description, dueDate, priority } = req.body;
  const doctorId = req.user._id.toString();

  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can create tasks');

  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');

  const sessionDoctorId = session.doctorId?._id?.toString() || session.doctorId?.toString();
  if (sessionDoctorId !== doctorId) throw new AuthorizationError('Unauthorized to create tasks for this session');

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
  const { patientId } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role;
  const { status } = req.query;

  if (userRole === 'patient' && userId !== patientId) throw new AuthorizationError('Unauthorized');

  let query = { patientId };
  if (userRole === 'doctor') query.doctorId = userId;
  if (status) query.status = status;

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
  const { doctorId } = req.params;
  const userId = req.user._id.toString();

  if (userId !== doctorId) throw new AuthorizationError('Unauthorized');

  const tasks = await Task.find({ doctorId })
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
  const userId = req.user._id.toString();

  const task = await Task.findById(taskId);
  if (!task) throw new NotFoundError('Task');

  if (task.patientId.toString() !== userId && task.doctorId.toString() !== userId) {
    throw new AuthorizationError('Unauthorized');
  }

  if (status) {
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
