const mongoose = require('mongoose');
const MentalHealthAssessment = require('./models/mentalHealthAssessment');

mongoose.connect('mongodb+srv://developmentveraawell:qu8pRsoYw3f25CFd@authentication.dkjyxzb.mongodb.net/', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to DB');
  const assessments = await MentalHealthAssessment.find().lean();
  console.log('Total assessments:', assessments.length);
  if (assessments.length > 0) {
    console.log('First assessment:', JSON.stringify(assessments[0], null, 2));
    
    // Check if testType is dla20 or disability
    const types = [...new Set(assessments.map(a => a.testType))];
    console.log('Unique test types in DB:', types);
  }
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
