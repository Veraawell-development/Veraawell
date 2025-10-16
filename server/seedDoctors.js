const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/user');
const DoctorProfile = require('./models/doctorProfile');

const seedDoctors = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/verocare', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB for seeding...');

    // Clear existing doctors
    await User.deleteMany({ role: 'doctor' });
    await DoctorProfile.deleteMany({});

    console.log('Cleared existing doctor data...');

    // Create doctor users
    const doctorsData = [
      {
        firstName: 'Ishan',
        lastName: 'Sharma',
        email: 'ishan.sharma@veraawell.com',
        username: 'ishan.sharma',
        password: 'doctor123',
        role: 'doctor'
      },
      {
        firstName: 'Aprajita',
        lastName: 'Singh',
        email: 'aprajita.singh@veraawell.com',
        username: 'aprajita.singh',
        password: 'doctor123',
        role: 'doctor'
      },
      {
        firstName: 'Isha',
        lastName: 'Sharma',
        email: 'isha.sharma@veraawell.com',
        username: 'isha.sharma',
        password: 'doctor123',
        role: 'doctor'
      },
      {
        firstName: 'Riya',
        lastName: 'Gupta',
        email: 'riya.gupta@veraawell.com',
        username: 'riya.gupta',
        password: 'doctor123',
        role: 'doctor'
      },
      {
        firstName: 'Amit',
        lastName: 'Patel',
        email: 'amit.patel@veraawell.com',
        username: 'amit.patel',
        password: 'doctor123',
        role: 'doctor'
      }
    ];

    // Hash passwords and create users
    const createdDoctors = [];
    for (const doctorData of doctorsData) {
      const hashedPassword = await bcrypt.hash(doctorData.password, 10);
      const doctor = new User({
        ...doctorData,
        password: hashedPassword
      });
      const savedDoctor = await doctor.save();
      createdDoctors.push(savedDoctor);
    }

    console.log('Created doctor users...');

    // Create doctor profiles
    const profilesData = [
      {
        userId: createdDoctors[0]._id,
        specialization: ['Clinical Psychology', 'Cognitive Behavioral Therapy'],
        experience: 5,
        qualification: ['MPhil Psychology', 'BSc Psychology'],
        languages: ['English', 'Hindi'],
        treatsFor: ['Depressive disorders', 'ADHD', 'OCD'],
        pricing: { min: 500, max: 1500 },
        profileImage: '/doctor-01.svg',
        bio: 'Experienced clinical psychologist specializing in cognitive behavioral therapy and mood disorders.',
        isOnline: true
      },
      {
        userId: createdDoctors[1]._id,
        specialization: ['Family Therapy', 'Relationship Counseling'],
        experience: 5,
        qualification: ['MPhil Psychology', 'BSc Psychology'],
        languages: ['English', 'Hindi'],
        treatsFor: ['Relationship issues', 'Family conflicts', 'Communication problems'],
        pricing: { min: 600, max: 1800 },
        profileImage: '/doctor-02.svg',
        bio: 'Specializes in family therapy and relationship counseling with a holistic approach.',
        isOnline: false
      },
      {
        userId: createdDoctors[2]._id,
        specialization: ['Child Psychology', 'Developmental Disorders'],
        experience: 4,
        qualification: ['MPhil Psychology', 'BSc Psychology'],
        languages: ['English', 'Hindi'],
        treatsFor: ['Autism Spectrum Disorders', 'ADHD in children', 'Learning disabilities'],
        pricing: { min: 700, max: 2000 },
        profileImage: '/doctor-01.svg',
        bio: 'Child psychologist with expertise in developmental disorders and learning disabilities.',
        isOnline: true
      },
      {
        userId: createdDoctors[3]._id,
        specialization: ['Trauma Therapy', 'PTSD Treatment'],
        experience: 7,
        qualification: ['MPhil Psychology', 'BSc Psychology', 'Trauma Therapy Certification'],
        languages: ['English', 'Hindi', 'Punjabi'],
        treatsFor: ['PTSD', 'Trauma recovery', 'Anxiety disorders'],
        pricing: { min: 800, max: 2500 },
        profileImage: '/doctor-02.svg',
        bio: 'Trauma specialist with extensive experience in PTSD treatment and recovery.',
        isOnline: true
      },
      {
        userId: createdDoctors[4]._id,
        specialization: ['Addiction Counseling', 'Substance Abuse'],
        experience: 6,
        qualification: ['MPhil Psychology', 'BSc Psychology', 'Addiction Counseling Certificate'],
        languages: ['English', 'Hindi', 'Gujarati'],
        treatsFor: ['Substance abuse', 'Addiction recovery', 'Behavioral addictions'],
        pricing: { min: 650, max: 1900 },
        profileImage: '/doctor-01.svg',
        bio: 'Addiction counselor specializing in substance abuse and behavioral addiction recovery.',
        isOnline: false
      }
    ];

    // Create doctor profiles
    for (const profileData of profilesData) {
      const profile = new DoctorProfile(profileData);
      await profile.save();
    }

    console.log('Created doctor profiles...');
    console.log('Seeding completed successfully!');

    // Display created doctors
    const doctors = await DoctorProfile.find({})
      .populate('userId', 'firstName lastName email');
    
    console.log('\nCreated Doctors:');
    doctors.forEach((doctor, index) => {
      console.log(`${index + 1}. ${doctor.userId.firstName} ${doctor.userId.lastName}`);
      console.log(`   Email: ${doctor.userId.email}`);
      console.log(`   Specialization: ${doctor.specialization.join(', ')}`);
      console.log(`   Pricing: ₹${doctor.pricing.min} - ₹${doctor.pricing.max}`);
      console.log(`   Online: ${doctor.isOnline ? 'Yes' : 'No'}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedDoctors();
