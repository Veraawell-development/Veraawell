const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdminToken } = require('../middleware/auth.middleware');
const { publicUploadLimiter } = require('../middleware/rateLimit.middleware');
const { imageUpload, documentUpload, withClientErrors, uploadProfileImage, uploadBannerImage, uploadDoctorDocuments, uploadDoctorDocument, uploadArticleImage } = require('../controllers/upload.controller');
const { requireSuperAdmin, requireRole, publicRoute } = require('../authz');

// Both write only the caller's own records (req.actor.id), so a role gate is
// the whole policy. The role check runs BEFORE multer, so a refused caller's
// file is never buffered, let alone sent to Cloudinary.
router.post('/profile-image', verifyToken, requireRole('patient', 'doctor'), withClientErrors(imageUpload.single('image')), uploadProfileImage);
router.post('/banner-image', verifyToken, requireRole('doctor'), withClientErrors(imageUpload.single('image')), uploadBannerImage);
// DELETE /profile-image/:publicId was removed.
//
// It called cloudinary.uploader.destroy() on whatever public id the caller
// supplied, with no ownership check whatsoever — so any authenticated user
// could permanently delete any asset in the Cloudinary account, including
// other doctors' verification documents and article images. Public ids are
// discoverable: they are embedded in the image URLs the public therapist
// directory already returns.
//
// It also had zero call sites in the client. Rather than bolt an ownership
// check onto an endpoint nobody uses, it is gone. If image deletion is wanted
// later it should take no id at all and delete the caller's OWN current
// image, resolved server-side from their profile.
// These two are intentionally NOT behind verifyToken: a career-page applicant
// uploads verification documents before they have an account (see CareerPage.tsx,
// which calls these with no credentials, ahead of /auth/register). The abuse
// guard here is publicUploadLimiter, not authentication — do not "fix" this by
// adding verifyToken, that would break the actual application flow.
router.post('/doctor-documents', publicRoute('careers-page applicants upload verification documents before they have an account'), publicUploadLimiter, withClientErrors(documentUpload.array('documents', 5)), uploadDoctorDocuments);
router.post('/doctor-document', publicRoute('careers-page applicants upload verification documents before they have an account'), publicUploadLimiter, withClientErrors(documentUpload.single('document')), uploadDoctorDocument);
// Article routes elsewhere are all verifyAdminToken + verifySuperAdmin; this
// one was admin-only, so a regular admin could upload images for content they
// could not otherwise create or edit. Same tier as the content it belongs to.
router.post('/article-image', verifyAdminToken, requireSuperAdmin(), withClientErrors(imageUpload.single('image')), uploadArticleImage);

module.exports = router;
