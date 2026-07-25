require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('./models/Session');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const sessions = await Session.find().sort({ createdAt: -1 }).limit(2);
  sessions.forEach(s => {
    console.log(`- ID: ${s._id} | sessionTime: ${s.sessionTime}`);
  });
  mongoose.disconnect();
});
