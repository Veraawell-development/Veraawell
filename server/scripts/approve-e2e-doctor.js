require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/user.model');

async function approveE2EDoctor() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env');
    }
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[APPROVE-SCRIPT] Connected to MongoDB');
    
    const result = await User.updateOne(
      { email: 'e2e.doctor@veerawell.test' },
      { $set: { approvalStatus: 'approved' } }
    );
    
    if (result.matchedCount > 0) {
      console.log('[APPROVE-SCRIPT] [OK] Successfully approved E2E doctor account.');
    } else {
      console.log('[APPROVE-SCRIPT] [WARN] E2E doctor account not found.');
    }
  } catch (error) {
    console.error('[APPROVE-SCRIPT] [ERR] Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

approveE2EDoctor();
