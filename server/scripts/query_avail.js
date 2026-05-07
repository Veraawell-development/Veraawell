const mongoose = require('mongoose');
const DoctorAvailability = require('./models/doctorAvailability');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const avail = await DoctorAvailability.findOne();
    console.log(JSON.stringify(avail, null, 2));
    process.exit(0);
  })
  .catch(err => { console.error(err); process.exit(1); });
