const express = require('express');
const router = express.Router();
const User = require('../../models/user');
const DoctorProfile = require('../../models/doctorProfile');
const { verifyAdminToken, verifySuperAdmin } = require('../../middleware/auth.middleware');
const emailService = require('../../services/email.service');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('ADMIN-APPROVALS');

/**
 * The User fields an admin screen may see — an allowlist, not `-password`.
 *
 * These queries used to project only `-password`, so every admin (not just
 * super admins) could read each doctor's live `resetToken` from
 * /doctors/pending and /doctors/all. A reset token is a password: request a
 * reset for any doctor, read the token here, set a new password, sign in as
 * them. The model's toJSON now strips credentials as a backstop, but the
 * query is where the decision belongs, and an allowlist is what keeps the
 * next sensitive field added to User from leaking the same way.
 */
const ADMIN_USER_VIEW = [
  '_id', 'firstName', 'lastName', 'email', 'username', 'role', 'status',
  'createdAt', 'updatedAt', 'approvalStatus', 'approvedBy', 'approvedAt', 'rejectionReason',
  'phoneNumber', 'countryCode', 'gender', 'dateOfBirth', 'profileImage',
  'specialization', 'licenseNumber', 'jobRole', 'professionalMessage', 'heardAboutUs', 'documents',
  'profileCompleted', 'isVerified', 'isOnline', 'lastActiveAt', 'lastLogin'
].join(' ');

/**
 * Status emails follow a decision that is already saved. A mail failure must
 * not turn a completed approval into a 500 — the admin would retry, and the
 * second attempt would 400 with "already approved".
 */
async function notify(label, send) {
  try {
    await send();
  } catch (error) {
    logger.error(`Could not send ${label} email`, { error: error.message });
  }
}

// ==================== ADMIN APPROVALS (Super Admin Only) ====================

// Get all pending admin requests
router.get('/admins/pending', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const pendingAdmins = await User.find({
      role: 'admin',
      approvalStatus: 'pending'
    }).select(ADMIN_USER_VIEW).sort({ createdAt: -1 });

    res.json(pendingAdmins);
  } catch (error) {
    logger.error('Error fetching pending admins', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch pending admins' });
  }
});

// Get all admins (approved and pending)
router.get('/admins/all', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const admins = await User.find({
      role: 'admin'
    })
      .select(ADMIN_USER_VIEW)
      .populate('approvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json(admins);
  } catch (error) {
    logger.error('Error fetching admins', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch admins' });
  }
});

// Approve admin
router.post('/admins/:adminId/approve', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const superAdminId = req.admin._id;

    const admin = await User.findById(adminId);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.role !== 'admin') {
      return res.status(400).json({ message: 'User is not an admin' });
    }

    if (admin.approvalStatus === 'approved') {
      return res.status(400).json({ message: 'Admin already approved' });
    }

    admin.approvalStatus = 'approved';
    admin.approvedBy = superAdminId;
    admin.approvedAt = new Date();
    await admin.save();

    // Log activity
    await admin.logActivity('approved_by_super_admin', {
      approvedBy: superAdminId,
      timestamp: new Date()
    });

    res.json({
      message: 'Admin approved successfully',
      admin: {
        id: admin._id,
        name: `${admin.firstName} ${admin.lastName}`,
        email: admin.email,
        approvalStatus: admin.approvalStatus
      }
    });
  } catch (error) {
    logger.error('Error approving admin', { error: error.message });
    res.status(500).json({ message: 'Failed to approve admin' });
  }
});

// Reject admin
router.post('/admins/:adminId/reject', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const { reason } = req.body;

    const admin = await User.findById(adminId);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.role !== 'admin') {
      return res.status(400).json({ message: 'User is not an admin' });
    }

    admin.approvalStatus = 'rejected';
    admin.rejectionReason = reason || 'No reason provided';
    await admin.save();

    // Log activity
    await admin.logActivity('rejected_by_super_admin', {
      reason: admin.rejectionReason,
      timestamp: new Date()
    });

    res.json({
      message: 'Admin rejected successfully',
      admin: {
        id: admin._id,
        name: `${admin.firstName} ${admin.lastName}`,
        email: admin.email,
        approvalStatus: admin.approvalStatus
      }
    });
  } catch (error) {
    logger.error('Error rejecting admin', { error: error.message });
    res.status(500).json({ message: 'Failed to reject admin' });
  }
});

// ==================== DOCTOR APPROVALS (Admin & Super Admin) ====================

// Get all pending doctor requests
router.get('/doctors/pending', verifyAdminToken, async (req, res) => {
  try {
    // This handler used to console.log the whole req.admin document — the
    // signed-in admin's password hash, reset token and activity log — on
    // every dashboard load, straight into the hosting provider's log store.
    const pendingDoctors = await User.find({
      role: 'doctor',
      approvalStatus: 'pending'
    })
      .select(ADMIN_USER_VIEW)
      .sort({ createdAt: -1 });

    // Also get their doctor profiles if they exist in a single query
    const doctorIds = pendingDoctors.map(d => d._id);
    const profiles = await DoctorProfile.find({ userId: { $in: doctorIds } });
    const profileMap = new Map(profiles.map(p => [p.userId.toString(), p]));

    const doctorsWithProfiles = pendingDoctors.map(doctor => ({
      ...doctor.toObject(),
      profile: profileMap.get(doctor._id.toString()) || null
    }));

    res.json(doctorsWithProfiles);
  } catch (error) {
    logger.error('Error fetching pending doctors', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch pending doctors' });
  }
});

// Get all doctors (approved and pending)
router.get('/doctors/all', verifyAdminToken, async (req, res) => {
  try {
    const doctors = await User.find({
      role: 'doctor'
    })
      .select(ADMIN_USER_VIEW)
      .populate('approvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Also get their doctor profiles in a single query
    const doctorIds = doctors.map(d => d._id);
    const profiles = await DoctorProfile.find({ userId: { $in: doctorIds } });
    const profileMap = new Map(profiles.map(p => [p.userId.toString(), p]));

    const doctorsWithProfiles = doctors.map(doctor => ({
      ...doctor.toObject(),
      profile: profileMap.get(doctor._id.toString()) || null
    }));

    res.json(doctorsWithProfiles);
  } catch (error) {
    logger.error('Error fetching doctors', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch doctors' });
  }
});

// Approve doctor
router.post('/doctors/:doctorId/approve', verifyAdminToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const adminId = req.admin._id;

    const doctor = await User.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    if (doctor.role !== 'doctor') {
      return res.status(400).json({ message: 'User is not a doctor' });
    }

    if (doctor.approvalStatus === 'approved') {
      return res.status(400).json({ message: 'Doctor already approved' });
    }

    doctor.approvalStatus = 'approved';
    doctor.approvedBy = adminId;
    doctor.approvedAt = new Date();
    await doctor.save();

    // Log activity
    await doctor.logActivity('approved_by_admin', {
      approvedBy: adminId,
      timestamp: new Date()
    });

    // REAL-TIME UPDATE: Notify doctor of approval
    const io = req.app.get('io');
    if (io) {
      const SocketEmitter = require('../../utils/socketEmitter');
      const emitter = new SocketEmitter(io);

      emitter.emitToUser(doctor._id.toString(), 'doctor:approval-status', {
        status: 'approved',
        approvedAt: doctor.approvedAt,
        timestamp: new Date()
      });

      logger.info('Doctor approval broadcasted', {
        doctorId: doctor._id.toString().substring(0, 8)
      });
    }

    await notify('doctor approval', () => emailService.sendDoctorApprovedEmail(doctor.email, doctor.firstName));

    res.json({
      message: 'Doctor approved successfully',
      doctor: {
        id: doctor._id,
        name: `${doctor.firstName} ${doctor.lastName}`,
        email: doctor.email,
        approvalStatus: doctor.approvalStatus
      }
    });
  } catch (error) {
    logger.error('Error approving doctor', { error: error.message });
    res.status(500).json({ message: 'Failed to approve doctor' });
  }
});

// Reject doctor
router.post('/doctors/:doctorId/reject', verifyAdminToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { reason } = req.body;

    const doctor = await User.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    if (doctor.role !== 'doctor') {
      return res.status(400).json({ message: 'User is not a doctor' });
    }

    doctor.approvalStatus = 'rejected';
    doctor.rejectionReason = reason || 'No reason provided';
    await doctor.save();

    // Log activity
    await doctor.logActivity('rejected_by_admin', {
      reason: doctor.rejectionReason,
      timestamp: new Date()
    });

    // REAL-TIME UPDATE: Notify doctor of rejection
    const io = req.app.get('io');
    if (io) {
      const SocketEmitter = require('../../utils/socketEmitter');
      const emitter = new SocketEmitter(io);

      emitter.emitToUser(doctor._id.toString(), 'doctor:approval-status', {
        status: 'rejected',
        reason: doctor.rejectionReason,
        timestamp: new Date()
      });

      logger.info('Doctor rejection broadcasted', {
        doctorId: doctor._id.toString().substring(0, 8)
      });
    }

    await notify('doctor rejection', () => emailService.sendDoctorRejectedEmail(doctor.email, doctor.firstName));

    res.json({
      message: 'Doctor rejected successfully',
      doctor: {
        id: doctor._id,
        name: `${doctor.firstName} ${doctor.lastName}`,
        email: doctor.email,
        approvalStatus: doctor.approvalStatus
      }
    });
  } catch (error) {
    logger.error('Error rejecting doctor', { error: error.message });
    res.status(500).json({ message: 'Failed to reject doctor' });
  }
});

// ==================== STATISTICS ====================

// Get approval statistics (for dashboard)
router.get('/statistics', verifyAdminToken, async (req, res) => {
  try {
    const userRole = req.admin.role;

    const [
      pendingDoctors, approvedDoctors, rejectedDoctors, totalDoctors,
      totalPatients
    ] = await Promise.all([
      User.countDocuments({ role: 'doctor', approvalStatus: 'pending' }),
      User.countDocuments({ role: 'doctor', approvalStatus: 'approved' }),
      User.countDocuments({ role: 'doctor', approvalStatus: 'rejected' }),
      User.countDocuments({ role: 'doctor' }),
      User.countDocuments({ role: 'patient' })
    ]);

    const stats = {
      doctors: {
        pending: pendingDoctors,
        approved: approvedDoctors,
        rejected: rejectedDoctors,
        total: totalDoctors
      },
      patients: {
        total: totalPatients
      }
    };

    // Only super admin can see admin stats
    if (userRole === 'super_admin') {
      const [pendingAdmins, approvedAdmins, rejectedAdmins, totalAdmins] = await Promise.all([
        User.countDocuments({ role: 'admin', approvalStatus: 'pending' }),
        User.countDocuments({ role: 'admin', approvalStatus: 'approved' }),
        User.countDocuments({ role: 'admin', approvalStatus: 'rejected' }),
        User.countDocuments({ role: 'admin' })
      ]);

      stats.admins = {
        pending: pendingAdmins,
        approved: approvedAdmins,
        rejected: rejectedAdmins,
        total: totalAdmins
      };
    }

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching statistics', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

// Get detailed analytics (sessions, revenue, growth)
router.get('/analytics', verifyAdminToken, async (req, res) => {
  try {
    const Session = require('../../models/session');
    const Report = require('../../models/report');
    const Task = require('../../models/task');

    // Get date ranges
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Execute all queries concurrently
    const [
      totalSessions, completedSessions, cancelledSessions, upcomingSessions,
      sessionsLast30Days, sessionsLast7Days,
      revenueData, revenueLast30DaysData,
      totalReports, totalTasks, completedTasks,
      newPatientsLast30Days, newDoctorsLast30Days,
      topDoctors
    ] = await Promise.all([
      // Session counts
      Session.countDocuments(),
      Session.countDocuments({ status: 'completed' }),
      Session.countDocuments({ status: 'cancelled' }),
      Session.countDocuments({ status: 'scheduled', scheduledDate: { $gte: now } }),
      Session.countDocuments({ createdAt: { $gte: last30Days } }),
      Session.countDocuments({ createdAt: { $gte: last7Days } }),
      
      // Revenue aggregations
      Session.aggregate([
        { $match: { status: 'completed', price: { $exists: true } } },
        { $group: { _id: null, total: { $sum: '$price' } } }
      ]),
      Session.aggregate([
        { $match: { status: 'completed', price: { $exists: true }, createdAt: { $gte: last30Days } } },
        { $group: { _id: null, total: { $sum: '$price' } } }
      ]),

      // Reports and tasks
      Report.countDocuments(),
      Task.countDocuments(),
      Task.countDocuments({ status: 'completed' }),

      // User growth
      User.countDocuments({ role: 'patient', createdAt: { $gte: last30Days } }),
      User.countDocuments({ role: 'doctor', createdAt: { $gte: last30Days } }),

      // Top doctors
      Session.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$doctorId', sessionCount: { $sum: 1 } } },
        { $sort: { sessionCount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'doctor'
          }
        },
        { $unwind: '$doctor' },
        {
          $project: {
            name: { $concat: ['$doctor.firstName', ' ', '$doctor.lastName'] },
            sessionCount: 1
          }
        }
      ])
    ]);

    const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;
    const revenue30Days = revenueLast30DaysData.length > 0 ? revenueLast30DaysData[0].total : 0;

    const analytics = {
      sessions: {
        total: totalSessions,
        completed: completedSessions,
        cancelled: cancelledSessions,
        upcoming: upcomingSessions,
        last30Days: sessionsLast30Days,
        last7Days: sessionsLast7Days
      },
      revenue: {
        total: totalRevenue,
        last30Days: revenue30Days,
        averagePerSession: completedSessions > 0 ? (totalRevenue / completedSessions).toFixed(2) : 0
      },
      content: {
        reports: totalReports,
        tasks: totalTasks,
        completedTasks: completedTasks
      },
      growth: {
        newPatients30Days: newPatientsLast30Days,
        newDoctors30Days: newDoctorsLast30Days
      },
      topDoctors: topDoctors
    };

    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching analytics', { error: error.message });
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

// Remove doctor (Super Admin only)
router.delete('/doctors/:doctorId', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const { doctorId } = req.params;

    const doctor = await User.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    if (doctor.role !== 'doctor') {
      return res.status(400).json({ message: 'User is not a doctor' });
    }

    // Delete doctor and their profile if exists
    await User.findByIdAndDelete(doctorId);
    await DoctorProfile.findOneAndDelete({ userId: doctorId });

    res.json({
      message: 'Doctor removed successfully',
      removedDoctor: {
        id: doctor._id,
        name: `${doctor.firstName} ${doctor.lastName}`
      }
    });
  } catch (error) {
    logger.error('Error removing doctor', { error: error.message });
    res.status(500).json({ message: 'Failed to remove doctor' });
  }
});

// Remove admin (Super Admin only)
router.delete('/admins/:adminId', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const superAdminId = req.admin._id;

    // Prevent self-deletion. `adminId` is a route-param string and
    // `req.admin._id` is a Mongoose ObjectId — a plain `===` compare between
    // them is always false in JS, so this guard never actually fired on its
    // own; it happened to be masked by the `role !== 'admin'` check below
    // (a super admin's own role is 'super_admin', which that check already
    // rejects), which in turn made the "Cannot remove super admin" check
    // after it unreachable dead code. Comparing as strings fixes both.
    if (String(adminId) === String(superAdminId)) {
      return res.status(400).json({ message: 'You cannot remove yourself' });
    }

    const admin = await User.findById(adminId);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (!['admin', 'super_admin'].includes(admin.role)) {
      return res.status(400).json({ message: 'User is not an admin' });
    }

    // Prevent removing super admins
    if (admin.role === 'super_admin') {
      return res.status(400).json({ message: 'Cannot remove super admin' });
    }

    await User.findByIdAndDelete(adminId);

    res.json({
      message: 'Admin removed successfully',
      removedAdmin: {
        id: admin._id,
        name: `${admin.firstName} ${admin.lastName}`
      }
    });
  } catch (error) {
    logger.error('Error removing admin', { error: error.message });
    res.status(500).json({ message: 'Failed to remove admin' });
  }
});

module.exports = router;
