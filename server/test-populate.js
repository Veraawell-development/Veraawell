require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('./models/Session');
const User = require('./models/User');
const emailService = require('./services/email.service');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  try {
    const session = await Session.findById('6a639803d958b13c748785c0')
      .populate('patientId', 'firstName lastName email')
      .populate('doctorId', 'firstName lastName email');
      
    console.log("Doctor:", session.doctorId);
    console.log("Patient:", session.patientId);
    
    if (session.patientId && session.patientId.email) {
      console.log("Sending email to:", session.patientId.email);
      await emailService.sendBookingConfirmationEmail(session.patientId.email, {
        date: new Date(session.sessionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: session.sessionTime,
        type: session.sessionType === 'immediate' ? 'Immediate' : 'Regular',
        doctorName: `${session.doctorId.firstName} ${session.doctorId.lastName}`,
        duration: session.duration,
        price: session.price
      });
      console.log("Success patient email");
    }
  } catch (e) {
    console.error("Error:", e);
  }
  mongoose.disconnect();
});
