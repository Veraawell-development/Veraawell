const express = require('express');
const router = express.Router();
const SessionNote = require('../models/sessionNote');
const Task = require('../models/task');
const Report = require('../models/report');
const Session = require('../models/session');
const Journal = require('../models/journal');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'veraawell_jwt_secret_key_2024_development_environment_secure_token_generation';

// Middleware to verify JWT token (supports both cookie and Authorization header)
const verifyToken = (req, res, next) => {
  // Check BOTH cookie AND Authorization header
  let token = req.cookies.token;
  
  // If no cookie, check Authorization header
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('[SESSION TOOLS AUTH] Token from Authorization header');
    }
  }
  
  if (!token) {
    console.log('[SESSION TOOLS AUTH] No token found');
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('[SESSION TOOLS AUTH] JWT verification error:', error.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ==================== SESSION NOTES ====================

// Create session note (Doctor only)
router.post('/notes', verifyToken, async (req, res) => {
  try {
    const { sessionId, patientId, content, mood, topicsDiscussed, progressInsights, therapeuticTechniques, isPrivate } = req.body;
    const doctorId = req.user.userId;

    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can create session notes' });
    }

    // Verify session exists and doctor is authorized
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }
    
    const sessionDoctorId = session.doctorId?._id?.toString() || session.doctorId?.toString();
    if (sessionDoctorId !== doctorId) {
      return res.status(403).json({ message: 'Unauthorized to create notes for this session' });
    }

    const note = new SessionNote({
      sessionId,
      doctorId,
      patientId,
      content,
      mood,
      topicsDiscussed,
      progressInsights,
      therapeuticTechniques,
      isPrivate: isPrivate || false
    });

    await note.save();
    
    const populatedNote = await SessionNote.findById(note._id)
      .populate('doctorId', 'firstName lastName')
      .populate('patientId', 'firstName lastName');

    res.status(201).json({
      message: 'Session note created successfully',
      note: populatedNote
    });
  } catch (error) {
    console.error('Error creating session note:', error);
    res.status(500).json({ message: 'Failed to create session note', error: error.message });
  }
});

// Get notes for a session
router.get('/notes/session/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Build query based on role
    let query = { sessionId };
    
    // Patients can only see non-private notes
    if (userRole === 'patient') {
      query.isPrivate = false;
      query.patientId = userId;
    } else if (userRole === 'doctor') {
      query.doctorId = userId;
    }

    const notes = await SessionNote.find(query)
      .populate('doctorId', 'firstName lastName')
      .populate('patientId', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (error) {
    console.error('Error fetching session notes:', error);
    res.status(500).json({ message: 'Failed to fetch session notes', error: error.message });
  }
});

// Get all notes for a patient
router.get('/notes/patient/:patientId', verifyToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Authorization check
    if (userRole === 'patient' && userId !== patientId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    let query = { patientId };
    
    if (userRole === 'patient') {
      query.isPrivate = false;
    } else if (userRole === 'doctor') {
      query.doctorId = userId;
    }

    const notes = await SessionNote.find(query)
      .populate('doctorId', 'firstName lastName')
      .populate('sessionId', 'sessionDate sessionTime')
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (error) {
    console.error('Error fetching patient notes:', error);
    res.status(500).json({ message: 'Failed to fetch patient notes', error: error.message });
  }
});

// Get all notes created by a doctor
router.get('/notes/doctor/:doctorId', verifyToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const userId = req.user.userId;

    // Authorization check - only the doctor can see their own notes
    if (userId !== doctorId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const notes = await SessionNote.find({ doctorId })
      .populate('patientId', 'firstName lastName')
      .populate('sessionId', 'sessionDate sessionTime')
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (error) {
    console.error('Error fetching doctor notes:', error);
    res.status(500).json({ message: 'Failed to fetch doctor notes', error: error.message });
  }
});

// ==================== TASKS ====================

// Create task (Doctor only)
router.post('/tasks', verifyToken, async (req, res) => {
  try {
    const { sessionId, patientId, title, description, dueDate, priority } = req.body;
    const doctorId = req.user.userId;

    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can create tasks' });
    }

    // Verify session exists and doctor is authorized
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }
    
    const sessionDoctorId = session.doctorId?._id?.toString() || session.doctorId?.toString();
    if (sessionDoctorId !== doctorId) {
      return res.status(403).json({ message: 'Unauthorized to create tasks for this session' });
    }

    const task = new Task({
      sessionId,
      doctorId,
      patientId,
      title,
      description,
      dueDate: new Date(dueDate),
      priority: priority || 'medium'
    });

    await task.save();
    
    const populatedTask = await Task.findById(task._id)
      .populate('doctorId', 'firstName lastName')
      .populate('patientId', 'firstName lastName');

    res.status(201).json({
      message: 'Task created successfully',
      task: populatedTask
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Failed to create task', error: error.message });
  }
});

// Get tasks for a patient
router.get('/tasks/patient/:patientId', verifyToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { status } = req.query;

    // Authorization check
    if (userRole === 'patient' && userId !== patientId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    let query = { patientId };
    
    if (userRole === 'doctor') {
      query.doctorId = userId;
    }

    if (status) {
      query.status = status;
    }

    const tasks = await Task.find(query)
      .populate('doctorId', 'firstName lastName')
      .populate('sessionId', 'sessionDate sessionTime')
      .sort({ dueDate: 1, createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Failed to fetch tasks', error: error.message });
  }
});

// Get all tasks assigned by a doctor
router.get('/tasks/doctor/:doctorId', verifyToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const userId = req.user.userId;

    // Authorization check - only the doctor can see their own tasks
    if (userId !== doctorId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const tasks = await Task.find({ doctorId })
      .populate('patientId', 'firstName lastName')
      .populate('sessionId', 'sessionDate sessionTime')
      .sort({ dueDate: 1, createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching doctor tasks:', error);
    res.status(500).json({ message: 'Failed to fetch doctor tasks', error: error.message });
  }
});

// Update task status (Patient can update)
router.put('/tasks/:taskId', verifyToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, patientNotes } = req.body;
    const userId = req.user.userId;

    const task = await Task.findById(taskId);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Authorization check
    if (task.patientId.toString() !== userId && task.doctorId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (status) {
      task.status = status;
      if (status === 'completed') {
        task.completedAt = new Date();
      }
    }

    if (patientNotes !== undefined) {
      task.patientNotes = patientNotes;
    }

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('doctorId', 'firstName lastName')
      .populate('patientId', 'firstName lastName');

    res.json({
      message: 'Task updated successfully',
      task: populatedTask
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Failed to update task', error: error.message });
  }
});

// ==================== REPORTS ====================

// Create report (Doctor only)
router.post('/reports', verifyToken, async (req, res) => {
  try {
    const { sessionId, patientId, title, reportType, content, isSharedWithPatient } = req.body;
    const doctorId = req.user.userId;

    console.log('📝 Creating report:', {
      sessionId: sessionId?.substring(0, 8),
      patientId: patientId?.substring(0, 8),
      doctorId: doctorId?.substring(0, 8),
      title,
      reportType
    });

    if (req.user.role !== 'doctor') {
      console.error('❌ Not a doctor');
      return res.status(403).json({ message: 'Only doctors can create reports' });
    }

    // Verify session exists and doctor is authorized
    console.log('🔍 Looking up session:', sessionId);
    const session = await Session.findById(sessionId);
    
    if (!session) {
      console.error('❌ Session not found:', sessionId);
      return res.status(404).json({ message: 'Session not found' });
    }
    
    console.log('✅ Session found:', {
      id: session._id.toString().substring(0, 8),
      doctorId: session.doctorId?.toString().substring(0, 8),
      patientId: session.patientId?.toString().substring(0, 8)
    });
    
    const sessionDoctorId = session.doctorId?._id?.toString() || session.doctorId?.toString();
    if (sessionDoctorId !== doctorId) {
      console.error('❌ Unauthorized - doctor mismatch:', { sessionDoctorId, doctorId });
      return res.status(403).json({ message: 'Unauthorized to create reports for this session' });
    }

    console.log('💾 Creating report document...');
    const report = new Report({
      sessionId,
      doctorId,
      patientId,
      title,
      reportType,
      content,
      isSharedWithPatient: isSharedWithPatient !== undefined ? isSharedWithPatient : true
    });

    console.log('💾 Saving report...');
    await report.save();
    console.log('✅ Report saved:', report._id.toString().substring(0, 8));
    
    console.log('👥 Populating report...');
    const populatedReport = await Report.findById(report._id)
      .populate('doctorId', 'firstName lastName')
      .populate('patientId', 'firstName lastName');

    console.log('✅ Report created successfully');
    res.status(201).json({
      message: 'Report created successfully',
      report: populatedReport
    });
  } catch (error) {
    console.error('❌ Error creating report:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Failed to create report', error: error.message });
  }
});

// Get reports for a patient
router.get('/reports/patient/:patientId', verifyToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Authorization check
    if (userRole === 'patient' && userId !== patientId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    let query = { patientId };
    
    // Patients can only see shared reports
    if (userRole === 'patient') {
      query.isSharedWithPatient = true;
    } else if (userRole === 'doctor') {
      query.doctorId = userId;
    }

    const reports = await Report.find(query)
      .populate('doctorId', 'firstName lastName')
      .populate('sessionId', 'sessionDate sessionTime')
      .sort({ createdAt: -1 });

    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});

// Get all reports created by a doctor
router.get('/reports/doctor/:doctorId', verifyToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const userId = req.user.userId;

    // Authorization check - only the doctor can see their own reports
    if (userId !== doctorId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const reports = await Report.find({ doctorId })
      .populate('patientId', 'firstName lastName')
      .populate('sessionId', 'sessionDate sessionTime')
      .sort({ createdAt: -1 });

    res.json(reports);
  } catch (error) {
    console.error('Error fetching doctor reports:', error);
    res.status(500).json({ message: 'Failed to fetch doctor reports', error: error.message });
  }
});

// Mark report as viewed by patient
router.put('/reports/:reportId/view', verifyToken, async (req, res) => {
  try {
    const { reportId } = req.params;
    const userId = req.user.userId;

    const report = await Report.findById(reportId);
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Only patient can mark as viewed
    if (report.patientId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    report.viewedByPatient = true;
    report.viewedAt = new Date();
    await report.save();

    res.json({
      message: 'Report marked as viewed',
      report
    });
  } catch (error) {
    console.error('Error marking report as viewed:', error);
    res.status(500).json({ message: 'Failed to mark report as viewed', error: error.message });
  }
});

// ==================== JOURNAL ====================

// Create journal entry (Patient only)
router.post('/journal', verifyToken, async (req, res) => {
  try {
    const { title, content, mood, tags } = req.body;
    const patientId = req.user.userId;

    if (req.user.role !== 'patient') {
      return res.status(403).json({ message: 'Only patients can create journal entries' });
    }

    const journal = new Journal({
      patientId,
      title,
      content,
      mood,
      tags: tags || []
    });

    await journal.save();

    res.status(201).json({
      message: 'Journal entry created successfully',
      journal
    });
  } catch (error) {
    console.error('Error creating journal entry:', error);
    res.status(500).json({ message: 'Failed to create journal entry', error: error.message });
  }
});

// Get all journal entries for a patient
router.get('/journal/patient/:patientId', verifyToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const userId = req.user.userId;

    // Only patient can view their own journal
    if (userId !== patientId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const journals = await Journal.find({ patientId })
      .sort({ createdAt: -1 });

    res.json(journals);
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ message: 'Failed to fetch journal entries', error: error.message });
  }
});

// Update journal entry
router.put('/journal/:journalId', verifyToken, async (req, res) => {
  try {
    const { journalId } = req.params;
    const { title, content, mood, tags } = req.body;
    const userId = req.user.userId;

    const journal = await Journal.findById(journalId);
    
    if (!journal) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }

    // Only owner can update
    if (journal.patientId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (title) journal.title = title;
    if (content) journal.content = content;
    if (mood !== undefined) journal.mood = mood;
    if (tags) journal.tags = tags;

    await journal.save();

    res.json({
      message: 'Journal entry updated successfully',
      journal
    });
  } catch (error) {
    console.error('Error updating journal entry:', error);
    res.status(500).json({ message: 'Failed to update journal entry', error: error.message });
  }
});

// Delete journal entry
router.delete('/journal/:journalId', verifyToken, async (req, res) => {
  try {
    const { journalId } = req.params;
    const userId = req.user.userId;

    const journal = await Journal.findById(journalId);
    
    if (!journal) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }

    // Only owner can delete
    if (journal.patientId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await Journal.findByIdAndDelete(journalId);

    res.json({
      message: 'Journal entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting journal entry:', error);
    res.status(500).json({ message: 'Failed to delete journal entry', error: error.message });
  }
});

module.exports = router;
