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

  // If user is a doctor, create/update doctor profile
  if (user.role === 'doctor') {
    const profileData = {
      userId: user._id,
      qualification: qualification || [],
      languages: languages || [],
      type: type || '',
      experience: experience || 0,
      specialization: specialization || [],
      treatsFor: specialization || [],
      pricing: {
        min: pricing?.discovery || pricing?.session30 || 0,
        max: pricing?.session45 || pricing?.session30 || 0
      },
      modeOfSession: modeOfSession || '',
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
        qualification: doctorProfile.qualification || [],
        languages: doctorProfile.languages || [],
        type: doctorProfile.type || '',
        experience: doctorProfile.experience?.toString() || '',
        specialization: doctorProfile.specialization || [],
        priceDiscovery: doctorProfile.pricing?.min?.toString() || '',
        price30: doctorProfile.pricing?.min?.toString() || '',
        price45: doctorProfile.pricing?.max?.toString() || '',
        modeOfSession: doctorProfile.modeOfSession || '',
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
      name: `${user.firstName} ${user.lastName}`.trim()
    }
  });
});

module.exports = {
  setupProfile,
  getProfileStatus,
  getProfile
};

