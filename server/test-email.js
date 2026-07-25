const { generateBookingConfirmationHTML } = require('./services/email.service');
try {
  console.log("Testing generation...");
  generateBookingConfirmationHTML({ date: '12', time: '12', type: 'Immediate' });
  console.log("Success");
} catch (e) {
  console.error("Error:", e);
}
