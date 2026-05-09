const mongoose = require('mongoose');
const User = require('./models/user');
const bcrypt = require('bcrypt');

mongoose.connect('mongodb+srv://developmentveraawell:qu8pRsoYw3f25CFd@authentication.dkjyxzb.mongodb.net/', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to DB');
  
  const existingUser = await User.findOne({ email: 'testpatient@gmail.com' });
  if (existingUser) {
    console.log('User already exists');
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const user = new User({
    firstName: 'Test',
    lastName: 'Patient',
    email: 'testpatient@gmail.com',
    username: 'testpatient@gmail.com',
    password: hashedPassword,
    role: 'patient',
    status: 'active',
    profileCompleted: true,
    approvalStatus: 'approved'
  });

  await user.save();
  console.log('Test patient created successfully');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
