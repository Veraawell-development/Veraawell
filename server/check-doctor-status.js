// Diagnostic script to check doctor approval status in database
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

async function checkDoctorStatus() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Find the test doctor
        const doctor = await User.findOne({ email: 'testdoctor@gmail.com' });

        if (!doctor) {
            console.log('❌ Doctor not found with email: testdoctor@gmail.com');
            return;
        }

        console.log('\n📋 Doctor Details:');
        console.log('==================');
        console.log('ID:', doctor._id);
        console.log('Email:', doctor.email);
        console.log('Name:', doctor.firstName, doctor.lastName);
        console.log('Role:', doctor.role);
        console.log('Approval Status:', doctor.approvalStatus);
        console.log('Approved By:', doctor.approvedBy);
        console.log('Approved At:', doctor.approvedAt);
        console.log('Created At:', doctor.createdAt);
        console.log('\n');

        // Check if there are any issues
        if (doctor.role !== 'doctor') {
            console.log('⚠️  WARNING: User role is not "doctor"');
        }

        if (doctor.approvalStatus === 'pending') {
            console.log('⚠️  Doctor is still PENDING approval');
        } else if (doctor.approvalStatus === 'approved') {
            console.log('✅ Doctor is APPROVED');
        } else if (doctor.approvalStatus === 'rejected') {
            console.log('❌ Doctor is REJECTED');
        }

        // Test password
        const testPassword = 'test123'; // Replace with actual password
        console.log('\n🔐 Testing password comparison...');
        // Note: We can't test password here without knowing it
        console.log('(Password test skipped - would need actual password)');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');
    }
}

checkDoctorStatus();
