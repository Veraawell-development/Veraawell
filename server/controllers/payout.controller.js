/**
 * Payout endpoints: the doctor's bank-details submission, and the admin's
 * weekly run.
 *
 * All business rules live in services/payoutLedger.js — these are thin, so
 * that the money logic has one home and is testable without HTTP.
 */

const DoctorProfile = require('../models/doctorProfile');
const Payout = require('../models/payout');
const ledger = require('../services/payoutLedger');
const { periodFor, previousPeriod } = require('../services/payoutPeriod');
const { asyncHandler } = require('../middleware/error.middleware');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PAYOUT-CTRL');

/**
 * Validated server-side, not just in the browser.
 *
 * A wrong IFSC or a mistyped account number means a transfer that either
 * bounces or — worse — succeeds into someone else's account. The formats are
 * fixed by NPCI/IT department rules, so there is no reason to accept anything
 * else this far in.
 */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ACCOUNT = /^\d{9,18}$/;

function validateBankDetails({ accountHolderName, accountNumber, ifsc, panNumber }) {
  const errors = {};
  const name = String(accountHolderName || '').trim();
  const account = String(accountNumber || '').replace(/\s/g, '');
  const code = String(ifsc || '').trim().toUpperCase();
  const pan = String(panNumber || '').trim().toUpperCase();

  if (name.length < 3) errors.accountHolderName = 'Enter the name exactly as it appears on the bank account';
  if (!ACCOUNT.test(account)) errors.accountNumber = 'Account number must be 9 to 18 digits';
  if (!IFSC.test(code)) errors.ifsc = 'IFSC must be 11 characters, e.g. HDFC0001234';
  if (!PAN.test(pan)) errors.panNumber = 'PAN must be 10 characters, e.g. ABCDE1234F';

  if (Object.keys(errors).length > 0) throw new ValidationError('Please correct these details', errors);
  return { accountHolderName: name, accountNumber: account, ifsc: code, panNumber: pan };
}

/** Only ever the last four digits leave the server. */
function maskAccount(accountNumber) {
  const value = String(accountNumber || '');
  return value ? `••••${value.slice(-4)}` : null;
}

/* ─────────────────────────── doctor-facing ─────────────────────────────── */

/** GET /api/payouts/bank-details — the doctor's own submission and its status */
const getMyBankDetails = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ userId: req.actor.id })
    .select('payoutApproved payoutBankStatus payoutRejectionReason payoutApprovedAt '
      + '+payoutBank.accountHolderName +payoutBank.accountNumber +payoutBank.ifsc +payoutBank.panNumber +payoutBank.submittedAt');
  if (!profile) throw new NotFoundError('Doctor profile');

  const bank = profile.payoutBank || {};
  res.json({
    success: true,
    status: profile.payoutBankStatus || 'not_submitted',
    payoutApproved: !!profile.payoutApproved,
    approvedAt: profile.payoutApprovedAt || null,
    rejectionReason: profile.payoutRejectionReason || null,
    // Never the full account number, even to its owner: there is no reason
    // for it to travel back out, and a response body ends up in logs and
    // browser caches.
    details: bank.submittedAt ? {
      accountHolderName: bank.accountHolderName,
      accountNumberMasked: maskAccount(bank.accountNumber),
      ifsc: bank.ifsc,
      panMasked: bank.panNumber ? `${bank.panNumber.slice(0, 3)}••••${bank.panNumber.slice(-1)}` : null,
      submittedAt: bank.submittedAt
    } : null
  });
});

/** POST /api/payouts/bank-details — submit or replace them */
const submitBankDetails = asyncHandler(async (req, res) => {
  const clean = validateBankDetails(req.body || {});

  const profile = await DoctorProfile.findOne({ userId: req.actor.id });
  if (!profile) throw new NotFoundError('Doctor profile');

  // Assigning the subdocument marks the path modified, which trips the
  // pre('validate') hook that revokes approval — so replacing details always
  // requires re-approval, and that rule cannot be forgotten here.
  profile.payoutBank = { ...clean, submittedAt: new Date() };
  profile.payoutBankStatus = 'pending_admin_approval';
  profile.payoutRejectionReason = null;
  await profile.save();

  logger.info('Bank details submitted', { doctorId: String(req.actor.id).substring(0, 8) });
  res.json({
    success: true,
    message: 'Details submitted. An admin will review them before you can take bookings.',
    status: 'pending_admin_approval'
  });
});

/** GET /api/payouts/my-payouts — the doctor's own payout history */
const getMyPayouts = asyncHandler(async (req, res) => {
  const payouts = await Payout.find({ doctorId: req.actor.id, status: { $in: ['locked', 'paid'] } })
    .select('periodKey periodStart periodEnd status sessionCount grossEarnings adjustmentsTotal netPayable carriedForward paidAt transferReference scheduledPayoutDate')
    .sort({ periodStart: -1 })
    .limit(52)
    .lean();

  res.json({ success: true, payouts });
});

/* ──────────────────────────── admin-facing ─────────────────────────────── */

/** GET /api/admin/payments/payouts/preview?period=2026-W37 */
const previewPayouts = asyncHandler(async (req, res) => {
  // Default to the period that has just closed — the one an admin actually
  // pays on a Tuesday — rather than the current, incomplete week.
  const periodKey = req.query.period || previousPeriod().periodKey;
  const preview = await ledger.previewPeriod(periodKey);
  res.json({ success: true, ...preview });
});

/** POST /api/admin/payments/payouts/generate */
const generatePayouts = asyncHandler(async (req, res) => {
  const periodKey = (req.body && req.body.period) || previousPeriod().periodKey;
  const result = await ledger.generatePayouts(periodKey, { adminId: req.actor.id });
  res.json({ success: true, message: `Drafted ${result.created.length} payout(s) for ${periodKey}`, ...result });
});

/** POST /api/admin/payments/payouts/:payoutId/lock */
const lockPayout = asyncHandler(async (req, res) => {
  const payout = await ledger.lockPayout(req.params.payoutId);
  res.json({ success: true, message: `Locked at ₹${payout.netPayable}`, payout });
});

/** POST /api/admin/payments/payouts/:payoutId/mark-paid */
const markPayoutPaid = asyncHandler(async (req, res) => {
  const payout = await ledger.markPaid(req.params.payoutId, {
    transferReference: req.body && req.body.transferReference,
    adminId: req.actor.id
  });
  res.json({ success: true, message: 'Payout recorded as paid', payout });
});

/** GET /api/admin/payments/payouts?period=&status= */
const listPayouts = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.period) filter.periodKey = req.query.period;
  if (['draft', 'locked', 'paid'].includes(req.query.status)) filter.status = req.query.status;

  const payouts = await Payout.find(filter)
    .populate('doctorId', 'firstName lastName email')
    .sort({ periodStart: -1, netPayable: -1 })
    .limit(200)
    .lean();

  res.json({ success: true, count: payouts.length, payouts, currentPeriod: periodFor().periodKey });
});

/** POST /api/admin/payments/payouts/bank-details/:doctorId/approve */
const approveBankDetails = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ userId: req.params.doctorId })
    .select('+payoutBank.accountNumber +payoutBank.submittedAt payoutBankStatus payoutApproved');
  if (!profile) throw new NotFoundError('Doctor profile');
  if (!profile.payoutBank || !profile.payoutBank.submittedAt) {
    throw new ValidationError('This doctor has not submitted bank details yet');
  }

  // Written with updateOne rather than save(): assigning payoutBank would
  // trip the re-approval hook and immediately undo the approval.
  await DoctorProfile.updateOne(
    { userId: req.params.doctorId },
    {
      $set: {
        payoutApproved: true,
        payoutApprovedAt: new Date(),
        payoutApprovedBy: req.actor.id,
        payoutBankStatus: 'approved',
        payoutRejectionReason: null
      }
    }
  );

  logger.info('Bank details approved', { doctorId: String(req.params.doctorId).substring(0, 8) });
  res.json({ success: true, message: 'Approved. This therapist can now take bookings.' });
});

/** POST /api/admin/payments/payouts/bank-details/:doctorId/reject */
const rejectBankDetails = asyncHandler(async (req, res) => {
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!reason) throw new ValidationError('A reason is required', { reason: 'Tell the therapist what to correct' });

  const updated = await DoctorProfile.updateOne(
    { userId: req.params.doctorId },
    {
      $set: {
        payoutApproved: false,
        payoutApprovedAt: null,
        payoutBankStatus: 'rejected',
        payoutRejectionReason: reason
      }
    }
  );
  if (updated.matchedCount === 0) throw new NotFoundError('Doctor profile');

  res.json({ success: true, message: 'Rejected. The therapist has been asked to resubmit.' });
});

/** GET /api/admin/payments/payouts/bank-details — the approval queue */
const listBankDetailSubmissions = asyncHandler(async (req, res) => {
  const status = ['not_submitted', 'pending_admin_approval', 'approved', 'rejected'].includes(req.query.status)
    ? req.query.status
    : 'pending_admin_approval';

  const profiles = await DoctorProfile.find({ payoutBankStatus: status })
    .select('userId payoutBankStatus payoutApproved payoutRejectionReason '
      + '+payoutBank.accountHolderName +payoutBank.accountNumber +payoutBank.ifsc +payoutBank.panNumber +payoutBank.submittedAt')
    .populate('userId', 'firstName lastName email phoneNumber')
    .lean();

  res.json({
    success: true,
    submissions: profiles.filter((p) => p.userId).map((p) => {
      const bank = p.payoutBank || {};
      return {
        doctorId: p.userId._id,
        name: `${p.userId.firstName} ${p.userId.lastName || ''}`.trim(),
        email: p.userId.email,
        phone: p.userId.phoneNumber,
        status: p.payoutBankStatus,
        payoutApproved: !!p.payoutApproved,
        rejectionReason: p.payoutRejectionReason || null,
        // The admin needs the FULL account number to make the transfer — this
        // is the one response that carries it, and it is super-admin only.
        accountHolderName: bank.accountHolderName || null,
        accountNumber: bank.accountNumber || null,
        ifsc: bank.ifsc || null,
        panNumber: bank.panNumber || null,
        submittedAt: bank.submittedAt || null
      };
    })
  });
});

module.exports = {
  getMyBankDetails,
  submitBankDetails,
  getMyPayouts,
  previewPayouts,
  generatePayouts,
  lockPayout,
  markPayoutPaid,
  listPayouts,
  approveBankDetails,
  rejectBankDetails,
  listBankDetailSubmissions,
  // exported for tests
  validateBankDetails
};
