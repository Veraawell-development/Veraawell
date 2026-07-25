require('dotenv').config();
const { sendBookingConfirmationEmail } = require('./services/email.service');
const mongoose = require('mongoose');

async function test() {
  try {
    console.log("Sending...");
    await sendBookingConfirmationEmail('test@example.com', {
      date: '24 Jul 2026',
      time: '14:00',
      type: 'Immediate',
      doctorName: 'Dr. John Doe',
      duration: 30,
      price: 0
    });
    console.log("Sent successfully.");
  } catch (e) {
    console.error("Error sending:", e);
  }
}
test();
