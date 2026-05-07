/**
 * Doctor Status Controller
 * Handles doctor online/offline status toggling and queries
 */

const User = require('../models/user');
const { asyncHandler } = require('../middleware/error.middleware');
const { AuthorizationError } = require('../utils/errors');
const { updateDoctorStatus } = require('../services/doctorStatus.service');
const { createLogger } = require('../utils/logger');

const logger = createLogger('DOCTOR-STATUS-CTRL');

/** POST /api/doctor-status/toggle-online — Toggle doctor's online status */
const toggleOnline = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can toggle online status');
  const userId = req.user._id.toString();
  const newStatus = !req.user.isOnline;
  const io = req.app.get('io');
  await updateDoctorStatus(userId, newStatus, io);
  logger.info('Doctor status toggled', { doctorId: userId.substring(0, 8), isOnline: newStatus });
  res.json({ success: true, isOnline: newStatus, lastActiveAt: new Date() });
});

/** GET /api/doctor-status/status — Get current doctor's own status */
const getStatus = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can check status');
  res.json({ success: true, isOnline: req.user.isOnline, lastActiveAt: req.user.lastActiveAt });
});

/** GET /api/doctor-status/online-doctors — Get all online doctors (public) */
const getOnlineDoctors = asyncHandler(async (req, res) => {
  const onlineDoctors = await User.find({ role: 'doctor', isOnline: true, approvalStatus: 'approved' })
    .select('firstName lastName email isOnline lastActiveAt profileCompleted')
    .sort({ lastActiveAt: -1 });
  res.json({ success: true, count: onlineDoctors.length, doctors: onlineDoctors });
});

/** POST /api/doctor-status/set-offline — Set doctor offline (called on logout) */
const setOffline = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') return res.json({ success: true }); // silently skip non-doctors
  const userId = req.user._id.toString();
  const io = req.app.get('io');
  await updateDoctorStatus(userId, false, io);
  logger.info('Doctor set offline', { doctorId: userId.substring(0, 8) });
  res.json({ success: true });
});

module.exports = { toggleOnline, getStatus, getOnlineDoctors, setOffline };
