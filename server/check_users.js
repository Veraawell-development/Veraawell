const mongoose = require('mongoose');
const User = require('./models/user');

mongoose.connect('mongodb+srv://developmentveraawell:qu8pRsoYw3f25CFd@authentication.dkjyxzb.mongodb.net/', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to DB');
  const user = await User.findOne({ role: 'patient' }).lean();
  if (user) {
    console.log('Patient user found:', user.email);
  } else {
    console.log('No patient user found');
  }
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
