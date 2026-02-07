const express = require('express');
const router = express.Router();
const User = require('../../models/user');
const DoctorProfile = require('../../models/doctorProfile');
const { verifyAdminToken, verifySuperAdmin } = require('../../middleware/auth.middleware');

// ==================== ADMIN APPROVALS (Super Admin Only) ====================

// Get all pending admin requests
router.get('/admins/pending', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const pendingAdmins = await User.find({
      role: 'admin',
      approvalStatus: 'pending'
    }).select('-password').sort({ createdAt: -1 });

    res.json(pendingAdmins);
  } catch (error) {
    console.error('Error fetching pending admins:', error);
    res.status(500).json({ message: 'Failed to fetch pending admins' });
  }
});

// Get all admins (approved and pending)
router.get('/admins/all', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const admins = await User.find({
      role: 'admin'
    })
      .select('-password')
      .populate('approvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
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
    console.error('Error approving admin:', error);
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
    console.error('Error rejecting admin:', error);
    res.status(500).json({ message: 'Failed to reject admin' });
  }
});

// ==================== DOCTOR APPROVALS (Admin & Super Admin) ====================

// Get all pending doctor requests
router.get('/doctors/pending', verifyAdminToken, async (req, res) => {
  try {
    console.log('[ADMIN] Fetching pending doctors...');
    console.log('[ADMIN] Admin user:', req.admin);

    const pendingDoctors = await User.find({
      role: 'doctor',
      approvalStatus: 'pending'
    })
      .select('-password')
      .sort({ createdAt: -1 });

    console.log(`[ADMIN] Found ${pendingDoctors.length} pending doctors`);
    if (pendingDoctors.length > 0) {
      console.log('[ADMIN] First doctor:', {
        id: pendingDoctors[0]._id,
        email: pendingDoctors[0].email,
        firstName: pendingDoctors[0].firstName,
        approvalStatus: pendingDoctors[0].approvalStatus
      });
    }

    // Also get their doctor profiles if they exist
    const doctorsWithProfiles = await Promise.all(
      pendingDoctors.map(async (doctor) => {
        const profile = await DoctorProfile.findOne({ userId: doctor._id });
        return {
          ...doctor.toObject(),
          profile: profile || null
        };
      })
    );

    console.log('[ADMIN] Returning doctors with profiles');
    res.json(doctorsWithProfiles);
  } catch (error) {
    console.error('[ADMIN] Error fetching pending doctors:', error);
    res.status(500).json({ message: 'Failed to fetch pending doctors' });
  }
});

// Get all doctors (approved and pending)
router.get('/doctors/all', verifyAdminToken, async (req, res) => {
  try {
    const doctors = await User.find({
      role: 'doctor'
    })
      .select('-password')
      .populate('approvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Also get their doctor profiles
    const doctorsWithProfiles = await Promise.all(
      doctors.map(async (doctor) => {
        const profile = await DoctorProfile.findOne({ userId: doctor._id });
        return {
          ...doctor.toObject(),
          profile: profile || null
        };
      })
    );

    res.json(doctorsWithProfiles);
  } catch (error) {
    console.error('Error fetching doctors:', error);
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

    // ✨ REAL-TIME UPDATE: Notify doctor of approval
    const io = req.app.get('io');
    if (io) {
      const SocketEmitter = require('../../utils/socketEmitter');
      const emitter = new SocketEmitter(io);

      emitter.emitToUser(doctor._id.toString(), 'doctor:approval-status', {
        status: 'approved',
        approvedAt: doctor.approvedAt,
        timestamp: new Date()
      });

      console.log('Doctor approval broadcasted', {
        doctorId: doctor._id.toString().substring(0, 8)
      });
    }

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
    console.error('Error approving doctor:', error);
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

    // ✨ REAL-TIME UPDATE: Notify doctor of rejection
    const io = req.app.get('io');
    if (io) {
      const SocketEmitter = require('../../utils/socketEmitter');
      const emitter = new SocketEmitter(io);

      emitter.emitToUser(doctor._id.toString(), 'doctor:approval-status', {
        status: 'rejected',
        reason: doctor.rejectionReason,
        timestamp: new Date()
      });

      console.log('Doctor rejection broadcasted', {
        doctorId: doctor._id.toString().substring(0, 8)
      });
    }

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
    console.error('Error rejecting doctor:', error);
    res.status(500).json({ message: 'Failed to reject doctor' });
  }
});

// ==================== STATISTICS ====================

// Get approval statistics (for dashboard)
router.get('/statistics', verifyAdminToken, async (req, res) => {
  try {
    const userRole = req.admin.role;

    const stats = {
      doctors: {
        pending: await User.countDocuments({ role: 'doctor', approvalStatus: 'pending' }),
        approved: await User.countDocuments({ role: 'doctor', approvalStatus: 'approved' }),
        rejected: await User.countDocuments({ role: 'doctor', approvalStatus: 'rejected' }),
        total: await User.countDocuments({ role: 'doctor' })
      },
      patients: {
        total: await User.countDocuments({ role: 'patient' })
      }
    };

    // Only super admin can see admin stats
    if (userRole === 'super_admin') {
      stats.admins = {
        pending: await User.countDocuments({ role: 'admin', approvalStatus: 'pending' }),
        approved: await User.countDocuments({ role: 'admin', approvalStatus: 'approved' }),
        rejected: await User.countDocuments({ role: 'admin', approvalStatus: 'rejected' }),
        total: await User.countDocuments({ role: 'admin' })
      };
    }

    res.json(stats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
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

    // Session analytics
    const totalSessions = await Session.countDocuments();
    const completedSessions = await Session.countDocuments({ status: 'completed' });
    const cancelledSessions = await Session.countDocuments({ status: 'cancelled' });
    const upcomingSessions = await Session.countDocuments({
      status: 'scheduled',
      scheduledDate: { $gte: now }
    });
    const sessionsLast30Days = await Session.countDocuments({
      createdAt: { $gte: last30Days }
    });
    const sessionsLast7Days = await Session.countDocuments({
      createdAt: { $gte: last7Days }
    });

    // Revenue analytics (from completed sessions)
    const revenueData = await Session.aggregate([
      { $match: { status: 'completed', price: { $exists: true } } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

    const revenueLast30Days = await Session.aggregate([
      {
        $match: {
          status: 'completed',
          price: { $exists: true },
          createdAt: { $gte: last30Days }
        }
      },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    const revenue30Days = revenueLast30Days.length > 0 ? revenueLast30Days[0].total : 0;

    // Reports and tasks
    const totalReports = await Report.countDocuments();
    const totalTasks = await Task.countDocuments();
    const completedTasks = await Task.countDocuments({ status: 'completed' });

    // User growth
    const newPatientsLast30Days = await User.countDocuments({
      role: 'patient',
      createdAt: { $gte: last30Days }
    });
    const newDoctorsLast30Days = await User.countDocuments({
      role: 'doctor',
      createdAt: { $gte: last30Days }
    });

    // Top doctors by sessions
    const topDoctors = await Session.aggregate([
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
    ]);

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
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

// Remove admin (Super Admin only)
router.delete('/admins/:adminId', verifyAdminToken, verifySuperAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const superAdminId = req.admin._id;

    // Prevent self-deletion
    if (adminId === superAdminId) {
      return res.status(400).json({ message: 'You cannot remove yourself' });
    }

    const admin = await User.findById(adminId);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.role !== 'admin') {
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
    console.error('Error removing admin:', error);
    res.status(500).json({ message: 'Failed to remove admin' });
  }
});

module.exports = router;
