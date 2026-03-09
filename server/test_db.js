require('dotenv').config();
const mongoose = require('mongoose');
const DoctorAvailability = require('./models/doctorAvailability');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const avail = await DoctorAvailability.findOne().lean();
  console.log(JSON.stringify(avail, null, 2));
  process.exit(0);
}
run();
