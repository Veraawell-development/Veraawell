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

// ==================== CLOUDINARY CALLS ====================

const TRANSIENT_NETWORK_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE']);

/** The Cloudinary SDK rejects with a plain object, sometimes nested under `error`. */
function cloudinaryDetail(err) {
  const inner = (err && err.error) || {};
  return {
    httpCode: (err && err.http_code) || inner.http_code || null,
    message: (err && err.message) || inner.message || String(err),
    name: (err && err.name) || inner.name || null,
    code: (err && err.code) || null
  };
}

function isTransient(err) {
  const { httpCode, message, code } = cloudinaryDetail(err);
  return TRANSIENT_NETWORK_CODES.has(code) || httpCode === 499 || httpCode >= 500 || /timeout/i.test(message);
}

/**
 * Upload, retrying once when the failure is the network's or Cloudinary's
 * rather than the file's. A doctor applicant who hit a momentary hiccup used
 * to be told "Failed to upload documents" with no way to know a second click
 * would work.
 */
async function uploadWithRetry(source, options) {
  try {
    return await cloudinary.uploader.upload(source, options);
  } catch (err) {
    if (!isTransient(err)) throw err;
    logger.warn('Cloudinary upload failed transiently; retrying once', cloudinaryDetail(err));
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    return cloudinary.uploader.upload(source, options);
  }
}

/**
 * Turn a failed upload into something the person can act on, and log the
 * real cause. Every failure used to be a bare 500 "Failed to upload …" — the
 * page could not say whether to retry, fix the file, or give up, and the logs
 * held only the message, not Cloudinary's status code.
 *
 * @param {string} subject  how to name the file to its owner, e.g. '“cv.pdf”'
 */
function sendUploadFailure(res, err, subject, logLabel) {
  const detail = cloudinaryDetail(err);
  const { httpCode } = detail;
  let status = 503;
  let code = 'UPLOAD_FAILED';
  let message = `${subject} didn't upload — the connection to our file storage failed. Please try again.`;
  let level = 'error';

  if (httpCode === 400) {
    status = 422; code = 'UPLOAD_REJECTED'; level = 'warn';
    const kinds = /image|photo|banner/i.test(subject) ? 'a JPG or PNG' : 'a PDF, JPG or PNG';
    message = `We couldn't process ${subject}. Check that it opens on your device and is ${kinds} under 5 MB, then try again.`;
  } else if (httpCode === 420 || httpCode === 429) {
    code = 'UPLOAD_BUSY'; level = 'warn';
    message = 'Our file storage is busy right now. Please try again in a minute.';
  } else if (httpCode === 401 || httpCode === 403 || httpCode === 404) {
    code = 'UPLOAD_UNAVAILABLE';
    message = 'Uploads are temporarily unavailable on our side. Please try again later, or email your documents to contact@veraawell.com.';
  }

  logger[level](logLabel, detail);
  return res.status(status).json({ success: false, code, message });
}

/** Remove multer's temp file, never throwing — this runs on the error path too. */
function removeTempFile(file) {
  try {
    if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (err) {
    logger.warn('Could not remove a temp upload', { error: err.message });
  }
}

// ==================== HANDLERS ====================

/** POST /api/upload/profile-image — Upload user profile picture */
const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const userId = req.actor.id;
    const result = await uploadWithRetry(dataURI, {
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
    return sendUploadFailure(res, error, 'Your photo', 'Profile image upload error');
  }
};

/** POST /api/upload/banner-image — Upload therapist banner image */
const uploadBannerImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const userId = req.actor.id;
    const result = await uploadWithRetry(dataURI, {
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
    return sendUploadFailure(res, error, 'Your banner image', 'Banner image upload error');
  }
};

/** POST /api/upload/doctor-documents — Upload multiple doctor verification documents */
const uploadDoctorDocuments = async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No document files provided' });
  const uploadedDocuments = [];
  let current = null;
  try {
    for (const file of req.files) {
      current = file;
      const publicId = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
      const result = await uploadWithRetry(file.path, { folder: 'veerawell/doctor-documents', resource_type: resourceType, public_id: publicId });
      removeTempFile(file);
      uploadedDocuments.push({ fileName: file.originalname, fileUrl: result.secure_url, fileType: file.mimetype, cloudinaryPublicId: result.public_id });
    }
    logger.info('Doctor documents uploaded', { count: uploadedDocuments.length });
    return res.json({ success: true, documents: uploadedDocuments });
  } catch (error) {
    req.files.forEach(removeTempFile);
    return sendUploadFailure(res, error, current ? `“${current.originalname}”` : 'Your document', 'Doctor document upload error');
  }
};

/** POST /api/upload/doctor-document — Upload single doctor document */
const uploadDoctorDocument = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No document file provided' });
  try {
    const publicId = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const resourceType = req.file.mimetype === 'application/pdf' ? 'raw' : 'image';
    const result = await uploadWithRetry(req.file.path, { folder: 'veerawell/doctor-documents', resource_type: resourceType, public_id: publicId });
    removeTempFile(req.file);
    logger.info('Single doctor document uploaded', { fileName: req.file.originalname });
    return res.json({ success: true, document: { fileName: req.file.originalname, fileUrl: result.secure_url, fileType: req.file.mimetype, cloudinaryPublicId: result.public_id } });
  } catch (error) {
    removeTempFile(req.file);
    return sendUploadFailure(res, error, `“${req.file.originalname}”`, 'Single document upload error');
  }
};

/** POST /api/upload/article-image — Upload an article cover image (Admin only) */
const uploadArticleImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const result = await uploadWithRetry(dataURI, { folder: 'veerawell/articles', resource_type: 'image', public_id: `article_${Date.now()}_${Math.random().toString(36).substring(7)}` });
    logger.info('Article image uploaded');
    res.json({ success: true, imageUrl: result.secure_url, publicId: result.public_id });
  } catch (error) {
    return sendUploadFailure(res, error, 'The article image', 'Article image upload error');
  }
};

module.exports = { imageUpload, documentUpload, withClientErrors, uploadProfileImage, uploadBannerImage, uploadDoctorDocuments, uploadDoctorDocument, uploadArticleImage, sendUploadFailure, isTransient };
