require('dotenv').config();
const mongoose = require('mongoose');

const availabilityDaySchema = new mongoose.Schema({
  date: { type: String, required: true },
  slots: [new mongoose.Schema({
    time: { type: String, required: true },
    isBooked: { type: Boolean, default: false },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null }
  })]
});

const doctorAvailabilitySchema = new mongoose.Schema({
  doctorId: mongoose.Schema.Types.ObjectId,
  availabilityType: String,
  defaultSlots: [String],
  customAvailability: [availabilityDaySchema],
  activeDates: [String],
  bookedSlots: Array
});

const DoctorAvailability = mongoose.models.DoctorAvailability || mongoose.model('DoctorAvailability', doctorAvailabilitySchema);

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    let avail = await DoctorAvailability.findOne({ doctorId: '6910f7ddc58221f6baaeb159' });
    
    // Simulate what the route does
    avail.customAvailability = [
      {
        date: '2026-03-05',
        slots: [{ time: '09:00 AM', isBooked: false }]
      }
    ];
    avail.activeDates = ['2026-03-05'];
    avail.defaultSlots = ['09:00 AM'];

    await avail.save();
    
    const check = await DoctorAvailability.findById(avail._id).lean();
    console.log("Saved directly in Mongoose:", JSON.stringify(check.customAvailability, null, 2));

    process.exit(0);
  })
  .catch(console.error);
