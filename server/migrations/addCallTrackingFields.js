// Migration script to add call tracking fields to existing sessions
const mongoose = require('mongoose');
require('dotenv').config();
const Session = require('../models/session');

async function migrateCallTrackingFields() {
  try {
    console.log('Starting migration: Adding call tracking fields to existing sessions...\n');

    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/verocare');
    console.log('Connected to MongoDB\n');

    // Find all sessions without call tracking fields
    const sessionsToUpdate = await Session.find({
      $or: [
        { callStatus: { $exists: false } },
        { callMode: { $exists: false } },
        { actualDuration: { $exists: false } }
      ]
    });

    console.log(`Found ${sessionsToUpdate.length} sessions to migrate\n`);

    let updatedCount = 0;
    for (const session of sessionsToUpdate) {
      // Add default values for missing fields
      if (!session.callStatus) {
        session.callStatus = 'not-started';
      }
      if (!session.callMode) {
        session.callMode = 'Video Calling';
      }
      if (session.actualDuration === undefined) {
        session.actualDuration = 0;
      }
      if (!session.callStartTime) {
        session.callStartTime = null;
      }
      if (!session.callEndTime) {
        session.callEndTime = null;
      }

      await session.save();
      updatedCount++;

      if (updatedCount % 10 === 0) {
        console.log(`   Updated ${updatedCount}/${sessionsToUpdate.length} sessions...`);
      }
    }

    console.log(`\nMigration completed successfully!`);
    console.log(`   Total sessions updated: ${updatedCount}`);

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    process.exit(0);
  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateCallTrackingFields();
