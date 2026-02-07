const express = require('express');
const router = express.Router();
const SessionReport = require('../models/sessionReport');
const Session = require('../models/session');
const { verifyToken } = require('../middleware/auth.middleware');

// Get all reports for a patient
router.get('/patient/:patientId', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;
        const userId = req.user._id.toString();

        // Verify user is the patient or a doctor who treated them
        if (userId !== patientId && req.user.role !== 'doctor') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        const reports = await SessionReport.find({ patientId, isSharedWithPatient: true })
            .populate('sessionId', 'sessionDate sessionTime')
            .populate('doctorId', 'firstName lastName')
            .sort({ createdAt: -1 })
            .lean();

        res.json(reports);
    } catch (error) {
        console.error('Error fetching patient reports:', error);
        res.status(500).json({ message: 'Failed to fetch reports' });
    }
});

// Get all reports for a specific session
router.get('/session/:sessionId', verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user._id.toString();

        // Verify user is part of the session
        const session = await Session.findById(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        if (session.patientId.toString() !== userId && session.doctorId.toString() !== userId) {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        const reports = await SessionReport.find({ sessionId })
            .populate('doctorId', 'firstName lastName')
            .sort({ createdAt: -1 })
            .lean();

        res.json(reports);
    } catch (error) {
        console.error('Error fetching session reports:', error);
        res.status(500).json({ message: 'Failed to fetch reports' });
    }
});

// Create a new report (doctor only)
router.post('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user._id;
        const userRole = req.user.role;

        // Only doctors can create reports
        if (userRole !== 'doctor') {
            return res.status(403).json({ message: 'Only doctors can create reports' });
        }

        const { sessionId, reportType, title, content, attachments } = req.body;

        // Verify session exists and doctor is part of it
        const session = await Session.findById(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        if (session.doctorId.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'You can only create reports for your own sessions' });
        }

        // Create report
        const report = new SessionReport({
            sessionId,
            patientId: session.patientId,
            doctorId: userId,
            reportType,
            title,
            content,
            attachments: attachments || []
        });

        await report.save();

        // Populate fields for response
        await report.populate('doctorId', 'firstName lastName');
        await report.populate('sessionId', 'sessionDate sessionTime');

        res.status(201).json(report);
    } catch (error) {
        console.error('Error creating report:', error);
        res.status(500).json({ message: 'Failed to create report' });
    }
});

// Get a single report by ID
router.get('/:reportId', verifyToken, async (req, res) => {
    try {
        const { reportId } = req.params;
        const userId = req.user._id.toString();

        const report = await SessionReport.findById(reportId)
            .populate('sessionId', 'sessionDate sessionTime patientId doctorId')
            .populate('doctorId', 'firstName lastName')
            .lean();

        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // Verify access
        if (report.patientId.toString() !== userId && report.doctorId._id.toString() !== userId) {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        res.json(report);
    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).json({ message: 'Failed to fetch report' });
    }
});

module.exports = router;
