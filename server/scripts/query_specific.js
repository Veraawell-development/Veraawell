const mongoose = require('mongoose');
require('dotenv').config();

const DoctorProfile = mongoose.models.DoctorProfile || mongoose.model('DoctorProfile', new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId, professionalTitle: String, bio: String }));
const DoctorAvailability = mongoose.models.DoctorAvailability || mongoose.model('DoctorAvailability', new mongoose.Schema({
  doctorId: mongoose.Schema.Types.ObjectId,
  availabilityType: String,
  defaultSlots: [String],
  customAvailability: Array,
  activeDates: [String],
  bookedSlots: Array
}));

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const prof = await DoctorProfile.findOne({ bio: { $regex: /testing doctor/i } }).lean();
    if (!prof) return console.log('No doctor found');
    console.log('Found doctor:', prof.userId);
    const avail = await DoctorAvailability.findOne({ doctorId: prof.userId }).lean();
    console.log(JSON.stringify(avail, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
