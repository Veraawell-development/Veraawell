const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdminToken } = require('../middleware/auth.middleware');
const { publicUploadLimiter } = require('../middleware/rateLimit.middleware');
const { imageUpload, documentUpload, uploadProfileImage, uploadBannerImage, deleteProfileImage, uploadDoctorDocuments, uploadDoctorDocument, uploadArticleImage } = require('../controllers/upload.controller');

router.post('/profile-image', verifyToken, imageUpload.single('image'), uploadProfileImage);
router.post('/banner-image', verifyToken, imageUpload.single('image'), uploadBannerImage);
router.delete('/profile-image/:publicId', verifyToken, deleteProfileImage);
// These two are intentionally NOT behind verifyToken: a career-page applicant
// uploads verification documents before they have an account (see CareerPage.tsx,
// which calls these with no credentials, ahead of /auth/register). The abuse
// guard here is publicUploadLimiter, not authentication — do not "fix" this by
// adding verifyToken, that would break the actual application flow.
router.post('/doctor-documents', publicUploadLimiter, documentUpload.array('documents', 5), uploadDoctorDocuments);
router.post('/doctor-document', publicUploadLimiter, documentUpload.single('document'), uploadDoctorDocument);
router.post('/article-image', verifyAdminToken, imageUpload.single('image'), uploadArticleImage);

module.exports = router;
