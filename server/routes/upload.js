const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdminToken } = require('../middleware/auth.middleware');
const { imageUpload, documentUpload, uploadProfileImage, uploadBannerImage, deleteProfileImage, uploadDoctorDocuments, uploadDoctorDocument, uploadArticleImage } = require('../controllers/upload.controller');

router.post('/profile-image', verifyToken, imageUpload.single('image'), uploadProfileImage);
router.post('/banner-image', verifyToken, imageUpload.single('image'), uploadBannerImage);
router.delete('/profile-image/:publicId', verifyToken, deleteProfileImage);
router.post('/doctor-documents', documentUpload.array('documents', 5), uploadDoctorDocuments);
router.post('/doctor-document', documentUpload.single('document'), uploadDoctorDocument);
router.post('/article-image', verifyAdminToken, imageUpload.single('image'), uploadArticleImage);

module.exports = router;
