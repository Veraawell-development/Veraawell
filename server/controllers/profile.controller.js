/**
 * Profile Controller
 * Handles profile-related route handlers
 */

const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PROFILE-CONTROLLER');

/**
 * Setup user profile
 */
const setupProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError('User');
  }

  const {
    name,
    fullName,
    phoneNumber,
    dateOfBirth,
    gender,
    emergencyContact,
    profileImage,
    qualification,
    languages,
    type,
    experience,
    specialization,
    pricing,
    modeOfSession,
    quote,
    quoteAuthor,
    introduction
  } = req.body;

  // Update user's name if fullName is provided (for patients)
  if (fullName) {
    const nameParts = fullName.trim().split(' ');
    user.firstName = nameParts[0] || '';
    user.lastName = nameParts.slice(1).join(' ') || '';
  }

  // Update user's phone number if provided (for all users)
  if (phoneNumber !== undefined) {
    user.phoneNumber = phoneNumber;
  }

  // Update basic info if provided
  if (dateOfBirth) user.dateOfBirth = dateOfBirth;
  if (gender) user.gender = gender;

  // Update emergency contact if provided
  if (emergencyContact) {
    user.emergencyContact = {
      name: emergencyContact.name || user.emergencyContact?.name || null,
      phone: emergencyContact.phone || user.emergencyContact?.phone || null,
      relationship: emergencyContact.relationship || user.emergencyContact?.relationship || null
    };
  }

  // If user is a doctor, create/update doctor profile
  if (user.role === 'doctor') {
    const profileData = {
      userId: user._id,
      profileImage: profileImage || '',
      qualification: qualification || [],
      languages: languages || [],
      type: type || '',
      experience: experience || 0,
      specialization: specialization || [],
      treatsFor: specialization || [],
      pricing: {
        min: pricing?.session20 || pricing?.session40 || 0,
        max: pricing?.session55 || pricing?.session40 || 0
      },
      modeOfSession: modeOfSession || [],
      quote: quote || '',
      quoteAuthor: quoteAuthor || '',
      bio: introduction || '',
      isOnline: true
    };

    await DoctorProfile.findOneAndUpdate(
      { userId: user._id },
      profileData,
      { upsert: true, new: true }
    );
  }

  // Mark profile as completed
  user.profileCompleted = true;
  await user.save();

  logger.info('Profile setup completed', { userId: user._id.toString().substring(0, 8) });

  res.json({
    success: true,
    message: 'Profile setup completed successfully',
    profileCompleted: true
  });
});

/**
 * Get profile status
 */
const getProfileStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError('User');
  }

  res.json({
    success: true,
    profileCompleted: user.profileCompleted || false
  });
});

/**
 * Get user profile data
 */
const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user) {
    throw new NotFoundError('User');
  }

  // If user is a doctor, fetch doctor profile
  if (user.role === 'doctor') {
    const doctorProfile = await DoctorProfile.findOne({ userId: user._id });

    if (!doctorProfile) {
      // No profile yet, return empty data
      return res.json({
        success: true,
        profile: null
      });
    }

    // Return profile data in the format expected by frontend
    return res.json({
      success: true,
      profile: {
        name: `${user.firstName} ${user.lastName}`.trim(),
        profileImage: doctorProfile.profileImage || '',
        qualification: doctorProfile.qualification || [],
        languages: doctorProfile.languages || [],
        type: doctorProfile.type || '',
        experience: doctorProfile.experience?.toString() || '',
        specialization: doctorProfile.specialization || [],
        priceDiscovery: '',
        price20: doctorProfile.pricing?.min?.toString() || '',
        price40: doctorProfile.pricing?.min?.toString() || '',
        price55: doctorProfile.pricing?.max?.toString() || '',
        modeOfSession: doctorProfile.modeOfSession || [],
        quote: doctorProfile.quote || '',
        quoteAuthor: doctorProfile.quoteAuthor || '',
        introduction: doctorProfile.bio || ''
      }
    });
  }

  // For non-doctors, return basic info
  res.json({
    success: true,
    profile: {
      name: `${user.firstName} ${user.lastName}`.trim(),
      phoneNumber: user.phoneNumber || '',
      countryCode: user.countryCode || '91',
      dateOfBirth: user.dateOfBirth || null,
      gender: user.gender || null,
      emergencyContact: user.emergencyContact || {
        name: null,
        phone: null,
        relationship: null
      }
    }
  });
});

/**
 * Update user profile (for phone number and basic info)
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { phoneNumber, countryCode } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Update phone number if provided
  if (phoneNumber !== undefined) {
    user.phoneNumber = phoneNumber;
  }

  if (countryCode !== undefined) {
    user.countryCode = countryCode;
  }

  await user.save();

  logger.info('Profile updated', { userId: user._id.toString().substring(0, 8) });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    phoneNumber: user.phoneNumber,
    countryCode: user.countryCode
  });
});

module.exports = {
  setupProfile,
  getProfileStatus,
  getProfile,
  updateProfile
};

