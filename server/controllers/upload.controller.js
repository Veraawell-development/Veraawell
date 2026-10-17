/**
 * Upload Controller
 * Handles all Cloudinary uploads — profile images, doctor documents, article images
 * Multer instances stay here since they are tightly coupled to these handlers
 */

const multer = require('multer');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');
const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');
const { ValidationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('UPLOAD-CTRL');

// ==================== MULTER CONFIGURATIONS ====================

const storage = multer.memoryStorage();

// A rejected file type is the caller's mistake. These were plain Errors, which
// the error handler can only report as a 500 — so a patient picking a PDF for
// their avatar was told the server had failed.
/** For profile/article images — images only */
const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new ValidationError('Only image files are allowed'), false);
    cb(null, true);
  }
});

/** For doctor documents — PDF and images */
const documentUpload = multer({
  dest: '/tmp/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(file.mimetype)) return cb(new ValidationError('Only PDF, JPG, and PNG files are allowed'), false);
    cb(null, true);
  }
});

/**
 * Wrap a multer middleware so its own limit errors (file too large, too many
 * files, unexpected field) reach the client as a 400 rather than a 500, for
 * the same reason as the fileFilter rejections above.
 */
function withClientErrors(middleware) {
  return function multerWithClientErrors(req, res, next) {
    middleware(req, res, (err) => {
      if (err instanceof multer.MulterError) return next(new ValidationError(err.message));
      return next(err);
    });
  };
}

// ==================== HANDLERS ====================

/** POST /api/upload/profile-image — Upload user profile picture */
const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const userId = req.actor.id;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'veerawell/profiles',
      transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }, { quality: 'auto' }, { fetch_format: 'auto' }],
      public_id: `user_${userId}_${Date.now()}`
    });

    // Every account's avatar lives on User.profileImage. Only a doctor also
    // has a DoctorProfile, which is where the public directory reads theirs.
    //
    // NOTE: User.profileImage is not yet declared on the User schema, which is
    // strict, so until it is this write is silently dropped — see
    // __tests__/e2e/dataLayer.test.js KNOWN_DROPPED_WRITES. It is written as a
    // plain $set so it starts persisting the moment the schema declares it.
    await User.updateOne({ _id: userId }, { $set: { profileImage: result.secure_url } });

    if (req.actor.role === 'doctor') {
      await DoctorProfile.findOneAndUpdate(
        { userId },
        { profileImage: result.secure_url },
        { upsert: true, new: true }
      );
    }

    logger.info('Profile image uploaded and saved', { userId: userId.substring(0, 8) });
    res.json({ success: true, imageUrl: result.secure_url, publicId: result.public_id });
  } catch (error) {
    logger.error('Profile image upload error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload image' });
  }
};

/** POST /api/upload/banner-image — Upload therapist banner image */
const uploadBannerImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const userId = req.actor.id;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'veerawell/banners',
      transformation: [{ width: 2400, crop: 'limit' }, { quality: 'auto:best' }, { fetch_format: 'auto' }],
      public_id: `banner_${userId}_${Date.now()}`
    });

    // A banner belongs on a therapist's public profile, so this route is
    // requireRole('doctor'). It used to accept any account and upsert, which
    // minted a stray DoctorProfile for every patient who reached it.
    await DoctorProfile.findOneAndUpdate(
      { userId },
      { bannerImage: result.secure_url },
      { upsert: true, new: true }
    );

    logger.info('Banner image uploaded and saved', { userId: userId.substring(0, 8) });
    res.json({ success: true, imageUrl: result.secure_url, publicId: result.public_id });
  } catch (error) {
    logger.error('Banner image upload error', { error: error.message || error });
    res.status(500).json({ success: false, message: 'Failed to upload banner image' });
  }
};

/** POST /api/upload/doctor-documents — Upload multiple doctor verification documents */
const uploadDoctorDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No document files provided' });
    const uploadedDocuments = [];
    for (const file of req.files) {
      const publicId = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
      const result = await cloudinary.uploader.upload(file.path, { folder: 'veerawell/doctor-documents', resource_type: resourceType, public_id: publicId });
      
      // Delete temp file after upload
      fs.unlinkSync(file.path);
      
      uploadedDocuments.push({ fileName: file.originalname, fileUrl: result.secure_url, fileType: file.mimetype, cloudinaryPublicId: result.public_id });
    }
    logger.info('Doctor documents uploaded', { count: uploadedDocuments.length });
    res.json({ success: true, documents: uploadedDocuments });
  } catch (error) {
    // Cleanup temp files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
    }
    logger.error('Doctor document upload error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload documents' });
  }
};

/** POST /api/upload/doctor-document — Upload single doctor document */
const uploadDoctorDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No document file provided' });
    
    const publicId = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const resourceType = req.file.mimetype === 'application/pdf' ? 'raw' : 'image';
    
    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'veerawell/doctor-documents', resource_type: resourceType, public_id: publicId });
    
    // Delete temp file after upload
    fs.unlinkSync(req.file.path);
    
    logger.info('Single doctor document uploaded', { fileName: req.file.originalname });
    res.json({ success: true, document: { fileName: req.file.originalname, fileUrl: result.secure_url, fileType: req.file.mimetype, cloudinaryPublicId: result.public_id } });
  } catch (error) {
    // Cleanup temp file on error
    if (req.file && req.file.path) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
    logger.error('Single document upload error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload document' });
  }
};

/** POST /api/upload/article-image — Upload an article cover image (Admin only) */
const uploadArticleImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const result = await cloudinary.uploader.upload(dataURI, { folder: 'veerawell/articles', resource_type: 'image', public_id: `article_${Date.now()}_${Math.random().toString(36).substring(7)}` });
    logger.info('Article image uploaded');
    res.json({ success: true, imageUrl: result.secure_url, publicId: result.public_id });
  } catch (error) {
    logger.error('Article image upload error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload article image' });
  }
};

module.exports = { imageUpload, documentUpload, withClientErrors, uploadProfileImage, uploadBannerImage, uploadDoctorDocuments, uploadDoctorDocument, uploadArticleImage };
