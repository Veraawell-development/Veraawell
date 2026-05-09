/**
 * Upload Controller
 * Handles all Cloudinary uploads — profile images, doctor documents, article images
 * Multer instances stay here since they are tightly coupled to these handlers
 */

const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { createLogger } = require('../utils/logger');

const logger = createLogger('UPLOAD-CTRL');

// ==================== MULTER CONFIGURATIONS ====================

const storage = multer.memoryStorage();

/** For profile/article images — images only */
const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed!'), false);
    cb(null, true);
  }
});

/** For doctor documents — PDF and images */
const documentUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Only PDF, JPG, and PNG files are allowed!'), false);
    cb(null, true);
  }
});

// ==================== HANDLERS ====================

/** POST /api/upload/profile-image — Upload user profile picture */
const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'veerawell/profiles',
      transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }, { quality: 'auto' }, { fetch_format: 'auto' }],
      public_id: `user_${req.user._id}_${Date.now()}`
    });
    logger.info('Profile image uploaded', { userId: req.user._id.toString().substring(0, 8) });
    res.json({ success: true, imageUrl: result.secure_url, publicId: result.public_id });
  } catch (error) {
    logger.error('Profile image upload error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload image', error: error.message });
  }
};

/** DELETE /api/upload/profile-image/:publicId — Delete a profile image */
const deleteProfileImage = async (req, res) => {
  try {
    await cloudinary.uploader.destroy(req.params.publicId);
    logger.info('Profile image deleted', { publicId: req.params.publicId });
    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    logger.error('Profile image delete error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to delete image', error: error.message });
  }
};

/** POST /api/upload/doctor-documents — Upload multiple doctor verification documents */
const uploadDoctorDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No document files provided' });
    const uploadedDocuments = [];
    for (const file of req.files) {
      const b64 = Buffer.from(file.buffer).toString('base64');
      const dataURI = `data:${file.mimetype};base64,${b64}`;
      const extension = file.originalname.split('.').pop();
      const publicId = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
      const result = await cloudinary.uploader.upload(dataURI, { folder: 'veerawell/doctor-documents', resource_type: resourceType, public_id: publicId });
      uploadedDocuments.push({ fileName: file.originalname, fileUrl: result.secure_url, fileType: file.mimetype, cloudinaryPublicId: result.public_id });
    }
    logger.info('Doctor documents uploaded', { count: uploadedDocuments.length });
    res.json({ success: true, documents: uploadedDocuments });
  } catch (error) {
    logger.error('Doctor document upload error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload documents', error: error.message });
  }
};

/** POST /api/upload/doctor-document — Upload single doctor document */
const uploadDoctorDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No document file provided' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const extension = req.file.originalname.split('.').pop();
    const publicId = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const resourceType = req.file.mimetype === 'application/pdf' ? 'raw' : 'image';
    const result = await cloudinary.uploader.upload(dataURI, { folder: 'veerawell/doctor-documents', resource_type: resourceType, public_id: publicId });
    logger.info('Single doctor document uploaded', { fileName: req.file.originalname });
    res.json({ success: true, document: { fileName: req.file.originalname, fileUrl: result.secure_url, fileType: req.file.mimetype, cloudinaryPublicId: result.public_id } });
  } catch (error) {
    logger.error('Single document upload error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload document', error: error.message });
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
    res.status(500).json({ success: false, message: 'Failed to upload article image', error: error.message });
  }
};

module.exports = { imageUpload, documentUpload, uploadProfileImage, deleteProfileImage, uploadDoctorDocuments, uploadDoctorDocument, uploadArticleImage };
