const mongoose = require('mongoose');
require('dotenv').config();

const doctorAvailabilitySchema = new mongoose.Schema({
  doctorId: mongoose.Schema.Types.ObjectId,
  availabilityType: String,
  defaultSlots: [String],
  customAvailability: Array,
  activeDates: [String],
  bookedSlots: Array
});

const DoctorAvailability = mongoose.model('DoctorAvailability', doctorAvailabilitySchema);

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const avail = await DoctorAvailability.findOne().lean();
    console.log(JSON.stringify(avail, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
