const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdminToken } = require('../middleware/auth.middleware');
const { publicUploadLimiter } = require('../middleware/rateLimit.middleware');
const { imageUpload, documentUpload, uploadProfileImage, uploadBannerImage, uploadDoctorDocuments, uploadDoctorDocument, uploadArticleImage } = require('../controllers/upload.controller');
const { requireSuperAdmin } = require('../authz');

router.post('/profile-image', verifyToken, imageUpload.single('image'), uploadProfileImage);
router.post('/banner-image', verifyToken, imageUpload.single('image'), uploadBannerImage);
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
router.post('/doctor-documents', publicUploadLimiter, documentUpload.array('documents', 5), uploadDoctorDocuments);
router.post('/doctor-document', publicUploadLimiter, documentUpload.single('document'), uploadDoctorDocument);
// Article routes elsewhere are all verifyAdminToken + verifySuperAdmin; this
// one was admin-only, so a regular admin could upload images for content they
// could not otherwise create or edit. Same tier as the content it belongs to.
router.post('/article-image', verifyAdminToken, requireSuperAdmin(), imageUpload.single('image'), uploadArticleImage);

module.exports = router;
