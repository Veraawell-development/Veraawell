require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('./models/Session');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const sessions = await Session.find().sort({ createdAt: -1 }).limit(2).populate('patientId').populate('doctorId');
  console.log("Recent 2 Sessions:");
  sessions.forEach(s => {
    console.log(`- ID: ${s._id}`);
    console.log(`  Patient: ${s.patientId?.email}`);
    console.log(`  Doctor: ${s.doctorId?.email}`);
    console.log(`  Price: ${s.price}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  Payment Status: ${s.paymentStatus}`);
    console.log(`  Razorpay ID: ${s.razorpayOrderId}`);
  });
  mongoose.disconnect();
});
