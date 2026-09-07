const express = require('express');
const router = express.Router();
const { verifyAdminToken } = require('../middleware/auth.middleware');
const { publicRoute, requireSuperAdmin } = require('../authz');
const { validateObjectIdParam, validateEnquiry } = require('../middleware/validation.middleware');
const { enquiryLimiter } = require('../middleware/rateLimit.middleware');
const enquiryController = require('../controllers/enquiry.controller');

// Public — the careers "Partner with us" / "Other Queries" tabs and /contact.
// Rate limited by email-then-IP so one address cannot flood the admin queue.
router.post('/',
  publicRoute('public enquiry form on the careers and contact pages'),
  enquiryLimiter,
  validateEnquiry,
  enquiryController.submitEnquiry);

// Super admin — reading and triaging the queue. Plain admins are excluded
// deliberately: enquiries carry unvetted contact details from the open web.
router.get('/', verifyAdminToken, requireSuperAdmin(), enquiryController.listEnquiries);
router.patch('/:id', verifyAdminToken, requireSuperAdmin(), validateObjectIdParam('id'), enquiryController.updateEnquiry);

module.exports = router;
