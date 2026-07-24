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
  const user = await User.findById(userId).select('-password -resetToken -resetTokenExpiry -signupOTP');

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
    bannerImage,
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

  // Update user's name if fullName or name is provided
  const targetName = fullName || name;
  if (targetName) {
    const nameParts = targetName.trim().split(' ');
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
      bannerImage: bannerImage || '/profile-bg.svg',
      qualification: qualification || [],
      languages: languages || [],
      type: type || '',
      experience: experience || 0,
      specialization: specialization || [],
      treatsFor: specialization || [],
      pricing: {
        session20: pricing?.session20 || 0,
        session40: pricing?.session40 || 0,
        session55: pricing?.session55 || 0,
        min: Math.min(...[
          pricing?.session20, pricing?.session40, pricing?.session55,
          pricing?.audio?.session20, pricing?.audio?.session40, pricing?.audio?.session55
        ].filter(p => p > 0)) || 0,
        max: Math.max(...[
          pricing?.session20, pricing?.session40, pricing?.session55,
          pricing?.audio?.session20, pricing?.audio?.session40, pricing?.audio?.session55
        ].filter(p => p > 0)) || 0,
        audio: {
          session20: pricing?.audio?.session20 || 0,
          session40: pricing?.audio?.session40 || 0,
          session55: pricing?.audio?.session55 || 0,
        }
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
  const user = await User.findById(userId).select('-password -resetToken -resetTokenExpiry -signupOTP');

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
  const user = await User.findById(userId).select('-password -resetToken -resetTokenExpiry -signupOTP');

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
        bannerImage: doctorProfile.bannerImage || '/profile-bg.svg',
        qualification: doctorProfile.qualification || [],
        languages: doctorProfile.languages || [],
        type: doctorProfile.type || '',
        experience: doctorProfile.experience?.toString() || '',
        specialization: doctorProfile.specialization || [],
        priceDiscovery: '',
        price20: doctorProfile.pricing?.session20?.toString() || doctorProfile.pricing?.min?.toString() || '',
        price40: doctorProfile.pricing?.session40?.toString() || doctorProfile.pricing?.min?.toString() || '',
        price55: doctorProfile.pricing?.session55?.toString() || doctorProfile.pricing?.max?.toString() || '',
        audioPrice20: doctorProfile.pricing?.audio?.session20?.toString() || '',
        audioPrice40: doctorProfile.pricing?.audio?.session40?.toString() || '',
        audioPrice55: doctorProfile.pricing?.audio?.session55?.toString() || '',
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
 * Update doctor pricing only (PATCH /api/profile/pricing)
 * Doctors can update their 6-slot price grid without re-submitting their full profile.
 */
const updatePricing = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ success: false, message: 'Only doctors can update pricing' });
  }

  const userId = req.user._id;
  const { pricing } = req.body;

  if (!pricing) {
    return res.status(400).json({ success: false, message: '"pricing" object is required in request body' });
  }

  // Validate all 6 slots
  const slotKeys = [
    { key: 'session20', label: '20-min video' },
    { key: 'session40', label: '40-min video' },
    { key: 'session55', label: '55-min video' },
    { key: 'audio.session20', label: '20-min audio' },
    { key: 'audio.session40', label: '40-min audio' },
    { key: 'audio.session55', label: '55-min audio' },
  ];

  for (const { key, label } of slotKeys) {
    const val = key.startsWith('audio.')
      ? pricing?.audio?.[key.replace('audio.', '')]
      : pricing?.[key];

    if (val !== undefined && val !== null && val !== '') {
      const num = Number(val);
      if (isNaN(num) || num < 0) {
        return res.status(400).json({ success: false, message: `${label} price must be a non-negative number` });
      }
      if (num > 0 && num < 100) {
        return res.status(400).json({ success: false, message: `${label} price must be at least ₹100` });
      }
      if (num > 10000) {
        return res.status(400).json({ success: false, message: `${label} price cannot exceed ₹10,000` });
      }
    }
  }

  // Logical ordering: longer sessions should cost >= shorter sessions (if both are set)
  const v20 = Number(pricing.session20) || 0;
  const v40 = Number(pricing.session40) || 0;
  const v55 = Number(pricing.session55) || 0;
  const a20 = Number(pricing?.audio?.session20) || 0;
  const a40 = Number(pricing?.audio?.session40) || 0;
  const a55 = Number(pricing?.audio?.session55) || 0;

  if (v20 > 0 && v40 > 0 && v40 < v20) {
    return res.status(400).json({ success: false, message: '40-min video price must be ≥ 20-min video price' });
  }
  if (v40 > 0 && v55 > 0 && v55 < v40) {
    return res.status(400).json({ success: false, message: '55-min video price must be ≥ 40-min video price' });
  }
  if (a20 > 0 && a40 > 0 && a40 < a20) {
    return res.status(400).json({ success: false, message: '40-min audio price must be ≥ 20-min audio price' });
  }
  if (a40 > 0 && a55 > 0 && a55 < a40) {
    return res.status(400).json({ success: false, message: '55-min audio price must be ≥ 40-min audio price' });
  }

  // Auto-calculate min/max for public profile display
  const allPrices = [v20, v40, v55, a20, a40, a55].filter(p => p > 0);
  const newMin = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const newMax = allPrices.length > 0 ? Math.max(...allPrices) : 0;

  const updatedProfile = await DoctorProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        'pricing.session20': v20,
        'pricing.session40': v40,
        'pricing.session55': v55,
        'pricing.audio.session20': a20,
        'pricing.audio.session40': a40,
        'pricing.audio.session55': a55,
        'pricing.min': newMin,
        'pricing.max': newMax,
      }
    },
    { new: true }
  );

  if (!updatedProfile) {
    return res.status(404).json({ success: false, message: 'Doctor profile not found. Please complete your profile setup first.' });
  }

  logger.info('Doctor pricing updated', { userId: userId.toString().substring(0, 8) });

  res.json({
    success: true,
    message: 'Pricing updated. New rates apply to future bookings only.',
    pricing: updatedProfile.pricing
  });
});

/**
 * Update user profile (for phone number and basic info)
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { phoneNumber, countryCode } = req.body;

  const user = await User.findById(userId).select('-password -resetToken -resetTokenExpiry -signupOTP');
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
  updateProfile,
  updatePricing
};


