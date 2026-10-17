/**
 * Doctor Status Controller
 * Handles doctor online/offline status toggling and queries
 */

const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const { PUBLIC_DOCTOR_FIELDS } = DoctorProfile;
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

/**
 * GET /api/doctor-status/online-doctors — online doctors a patient can book
 * right now (public; the "Available Now" tab).
 *
 * Two problems with what this used to return:
 *
 *  - every online practitioner's personal `email`, unauthenticated — the
 *    client printed it on the card;
 *  - anyone with the toggle on, bookable or not. The directory
 *    (session.controller getAllDoctors) only lists doctors with an approved
 *    payout route and a price, so "All Available" showed 0 while "Available
 *    Now" showed 2 doctors whose booking would then be refused.
 *
 * It now applies the directory's rules — approved account, payoutApproved,
 * pricing.min > 0 — minus the published-calendar condition, which an instant
 * session does not need. Each entry carries the public profile
 * (PUBLIC_DOCTOR_FIELDS, the same allowlist the directory uses) so the card
 * can be rendered from this response alone.
 */
const getOnlineDoctors = asyncHandler(async (req, res) => {
  const online = await User.find({ role: 'doctor', isOnline: true, approvalStatus: 'approved', status: 'active' })
    .select('firstName lastName isOnline lastActiveAt profileCompleted')
    .sort({ lastActiveAt: -1 })
    .lean();

  const profiles = await DoctorProfile.find({
    userId: { $in: online.map((d) => d._id) },
    payoutApproved: true,
    'pricing.min': { $gt: 0 }
  }).select(PUBLIC_DOCTOR_FIELDS).lean();
  const profileByUser = new Map(profiles.map((p) => [String(p.userId), p]));

  const doctors = online
    .filter((d) => profileByUser.has(String(d._id)))
    .map((d) => ({ ...d, profile: profileByUser.get(String(d._id)) }));

  res.json({ success: true, count: doctors.length, doctors });
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
