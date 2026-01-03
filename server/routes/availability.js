const express = require('express');
const router = express.Router();
const DoctorAvailability = require('../models/doctorAvailability');
const Session = require('../models/session');
const { verifyToken } = require('../middleware/auth.middleware');

// GET - Get doctor's availability settings
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    
    let availability = await DoctorAvailability.findOne({ doctorId });
    
    if (!availability) {
      // Create default availability if none exists
      availability = new DoctorAvailability({
        doctorId,
        availabilityType: 'same_slots',
        defaultSlots: ['09:00 AM', '11:00 AM', '03:00 PM', '05:00 PM'],
        activeDates: [],
        customAvailability: []
      });
      await availability.save();
    }
    
    res.json(availability);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ message: 'Failed to fetch availability', error: error.message });
  }
});

// GET - Get current logged-in doctor's availability
router.get('/doctor/current', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userRole = req.user.role;
    
    if (userRole !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can access this' });
    }
    
    let availability = await DoctorAvailability.findOne({ doctorId: userId });
    
    if (!availability) {
      // Create default availability if none exists
      availability = new DoctorAvailability({
        doctorId: userId,
        availabilityType: 'same_slots',
        defaultSlots: ['09:00 AM', '11:00 AM', '03:00 PM', '05:00 PM'],
        activeDates: [],
        customAvailability: []
      });
      await availability.save();
    }
    
    res.json(availability);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ message: 'Failed to fetch availability', error: error.message });
  }
});

// POST - Save/Update doctor's availability
router.post('/save', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userRole = req.user.role;
    
    if (userRole !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can set availability' });
    }
    
    const { availabilityType, defaultSlots, customAvailability, activeDates } = req.body;
    
    let availability = await DoctorAvailability.findOne({ doctorId: userId });
    
    if (availability) {
      // Update existing availability
      availability.availabilityType = availabilityType;
      availability.defaultSlots = defaultSlots || [];
      availability.customAvailability = customAvailability || [];
      availability.activeDates = activeDates || [];
    } else {
      // Create new availability
      availability = new DoctorAvailability({
        doctorId: userId,
        availabilityType,
        defaultSlots: defaultSlots || [],
        customAvailability: customAvailability || [],
        activeDates: activeDates || []
      });
    }
    
    await availability.save();
    
    res.json({ 
      message: 'Availability saved successfully', 
      availability 
    });
  } catch (error) {
    console.error('Error saving availability:', error);
    res.status(500).json({ message: 'Failed to save availability', error: error.message });
  }
});

// GET - Get available slots for a specific date
router.get('/slots/:doctorId/:date', async (req, res) => {
  try {
    const { doctorId, date } = req.params;
    
    const availability = await DoctorAvailability.findOne({ doctorId });
    
    if (!availability) {
      return res.json({ slots: [] });
    }
    
    const slots = availability.getAvailableSlotsForDate(date);
    
    // Filter out booked slots
    const availableSlots = slots.filter(slot => !slot.isBooked);
    
    res.json({ slots: availableSlots });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ message: 'Failed to fetch slots', error: error.message });
  }
});

// POST - Book a specific slot (called during session booking)
router.post('/book-slot', verifyToken, async (req, res) => {
  try {
    const { doctorId, date, time, sessionId } = req.body;
    
    const availability = await DoctorAvailability.findOne({ doctorId });
    
    if (!availability) {
      return res.status(404).json({ message: 'Doctor availability not found' });
    }
    
    const isAvailable = availability.isSlotAvailable(date, time);
    
    if (!isAvailable) {
      return res.status(400).json({ message: 'Slot is not available' });
    }
    
    const booked = await availability.bookSlot(date, time, sessionId);
    
    if (booked) {
      res.json({ message: 'Slot booked successfully' });
    } else {
      res.status(400).json({ message: 'Failed to book slot' });
    }
  } catch (error) {
    console.error('Error booking slot:', error);
    res.status(500).json({ message: 'Failed to book slot', error: error.message });
  }
});

// POST - Release a slot (called when session is cancelled)
router.post('/release-slot', verifyToken, async (req, res) => {
  try {
    const { doctorId, date, time } = req.body;
    
    const availability = await DoctorAvailability.findOne({ doctorId });
    
    if (!availability) {
      return res.status(404).json({ message: 'Doctor availability not found' });
    }
    
    const released = await availability.releaseSlot(date, time);
    
    if (released) {
      res.json({ message: 'Slot released successfully' });
    } else {
      res.json({ message: 'Slot release not needed or already released' });
    }
  } catch (error) {
    console.error('Error releasing slot:', error);
    res.status(500).json({ message: 'Failed to release slot', error: error.message });
  }
});

// GET - Get upcoming sessions for doctor (for the Manage Calendar page)
router.get('/upcoming-sessions', verifyToken, async (req, res) => {
  try {
    const { userId, userRole } = req;
    
    if (userRole !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can access this' });
    }
    
    const upcomingSessions = await Session.find({
      doctorId: userId,
      status: { $in: ['scheduled', 'completed', 'cancelled'] }
    })
    .populate('patientId', 'firstName lastName')
    .sort({ sessionDate: 1, sessionTime: 1 })
    .limit(20);
    
    res.json(upcomingSessions);
  } catch (error) {
    console.error('Error fetching upcoming sessions:', error);
    res.status(500).json({ message: 'Failed to fetch sessions', error: error.message });
  }
});

module.exports = router;
