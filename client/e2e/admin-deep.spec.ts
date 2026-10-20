/**
 * The admin console, end to end: who can see what, how an admin account comes
 * to exist and recovers its password, what happens when a session ends, and
 * the money and moderation flows a super admin runs every week.
 *
 * Every test arrives signed in the way a real admin is — the httpOnly
 * `adminToken` cookie, set by logging in or placed directly — and asserts on
 * what the admin sees, then on what the API/database agree happened.
 */

import { test, expect, Page } from '@playwright/test';
import { fixtures, API_URL } from './fixtures';
import {
  ObjectId, apiSend, asSuperAdmin, closeDb, createApprovedAdmin, createDoctorWithBankDetails,
  createPayableSession, db, expiredAdminToken, loginViaUi, setAdminCookie, sidebar, stamp, superAdminHeaders,
  waitForAdminResetUrl, waitForOtp,
} from './adminHelpers';

const SESSION_ENDED = 'Your admin session has ended — please sign in again';

test.afterAll(async () => {
  await closeDb();
});

const openTab = async (page: Page, label: string) => {
  await sidebar(page).getByRole('button', { name: new RegExp(`^${label}`) }).click();
};

/** Endpoints only a super admin may call. A normal admin's console must never ask. */
const SUPER_ADMIN_ONLY_API = /\/api\/(admin\/payments|enquiries|articles\/admin|admin\/approvals\/admins|upload\/article-image)/;

test.describe('tier gating', () => {
  test('a normal admin sees only their tabs, whatever the remembered tab or link says', async ({ page }) => {
    const { users } = fixtures();
    const superCalls: string[] = [];
    page.on('request', (r) => { if (SUPER_ADMIN_ONLY_API.test(r.url())) superCalls.push(r.url()); });
    // A super admin used this browser last and left Revenue open.
    await page.addInitScript(() => {
      try { window.localStorage.setItem('veraawell:adminTab', 'revenue'); } catch { /* ignore */ }
    });

    await loginViaUi(page, users.admin.email, users.admin.password);
    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();
    await expect(sidebar(page).getByRole('button')).toHaveText([/^Analytics/, /^Calls/, /^Pending Doctors/, /^Reviews/]);

    // A link carrying a super-admin tab in its state.
    await page.goto('/admin/articles');
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'New Article' })).toHaveCount(0);

    // The article editor's own route.
    await page.goto('/super-admin-dashboard/articles/new');
    await expect(page).toHaveURL(/\/super-admin-dashboard$/, { timeout: 15_000 });

    // What they can use, works.
    await openTab(page, 'Calls');
    await expect(page.getByRole('heading', { name: 'Call Reliability' })).toBeVisible();
    await expect(page.getByText('Calls connected')).toBeVisible({ timeout: 15_000 });
    await openTab(page, 'Reviews');
    await expect(page.getByRole('heading', { name: 'Review Moderation' })).toBeVisible();
    await openTab(page, 'Pending Doctors');
    await expect(page.getByRole('heading', { name: 'Doctor Approvals' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);

    expect(superCalls).toEqual([]);
  });
});

test.describe('admin sign-up', () => {
  test('applies with the emailed code, waits for approval, and gets in once a super admin approves', async ({ page, browser }) => {
    const id = stamp();
    const email = `e2e.signup.${id}@veraawell.test`;
    const password = 'SignupPass123!';

    await page.goto('/admin-signup');
    await page.getByLabel('First Name').fill('Signup');
    await page.getByLabel('Last Name').fill(`Tester${id}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Username').fill(`e2e.signup.${id}`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password').fill(password);
    await page.getByRole('button', { name: 'Submit Application' }).click();

    // Not "submitted" yet: the code has to be entered first.
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Resend code/ })).toBeVisible();

    const otp = await waitForOtp(email);
    const wrong = otp === '000000' ? '111111' : '000000';
    await page.getByLabel('Verification code').fill(wrong);
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByRole('alert')).toContainText(/Invalid verification code/i);

    await page.getByLabel('Verification code').fill(otp);
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByText(/Verified — a super admin will review your request; you'll get an email when approved/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: 'Go to admin sign in' }).click();
    await expect(page).toHaveURL(/\/admin-login/);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('alert')).toContainText(/pending approval/i);

    // A super admin approves the request in their own browser.
    const superContext = await browser.newContext();
    await asSuperAdmin(superContext);
    const superPage = await superContext.newPage();
    await superPage.goto('/super-admin-dashboard');
    await openTab(superPage, 'Pending Admins');
    const row = superPage.locator(`[data-admin-row="${email}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(superPage.getByText('Admin approved successfully')).toBeVisible();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
    await superContext.close();

    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 20_000 });
    await expect(sidebar(page).getByRole('button')).toHaveText([/^Analytics/, /^Calls/, /^Pending Doctors/, /^Reviews/]);
  });
});

test.describe('password recovery and change', () => {
  test('forgot password → emailed link → new password works and the old one does not', async ({ page }) => {
    const { email, password } = await createApprovedAdmin(page.request);
    const newPassword = 'ResetPass456!';

    await page.goto('/admin-login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/admin\/forgot-password/);
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status').filter({ hasText: /reset link is on its way/ })).toBeVisible();

    const resetUrl = await waitForAdminResetUrl(email);
    await page.goto(new URL(resetUrl).pathname);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('New password', { exact: true }).fill('short');
    await page.getByLabel('Confirm new password').fill('short');
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByRole('alert')).toContainText(/at least 8 characters/);

    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(`${newPassword}x`);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByRole('alert')).toContainText(/do not match/);

    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to admin sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();

    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid email or password');

    await page.locator('input[type="password"]').fill(newPassword);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 20_000 });
  });

  test('an unknown address gets the same answer as a real one', async ({ page }) => {
    await page.goto('/admin/forgot-password');
    await page.getByLabel('Email').fill(`nobody.${stamp()}@veraawell.test`);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status').filter({ hasText: /reset link is on its way/ })).toBeVisible();
  });

  test('an admin changes their password from the account menu', async ({ page }) => {
    const { email, password } = await createApprovedAdmin(page.request);
    const newPassword = 'Changed789!x';
    await loginViaUi(page, email, password);
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Change password' }).click();
    const dialog = page.getByRole('dialog', { name: 'Change password' });
    await dialog.getByLabel('Current password').fill('not-my-password');
    await dialog.getByLabel('New password', { exact: true }).fill(newPassword);
    await dialog.getByLabel('Confirm new password').fill(newPassword);
    await dialog.getByRole('button', { name: 'Change password' }).click();
    // A wrong current password is an answer, not the end of the session.
    await expect(dialog.getByRole('alert')).toContainText('Current password is incorrect');
    await expect(page).toHaveURL(/super-admin-dashboard/);

    await dialog.getByLabel('Current password').fill(password);
    await dialog.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Password changed')).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // The session survives its own password change.
    await openTab(page, 'Pending Doctors');
    await expect(page.getByRole('heading', { name: 'Doctor Approvals' })).toBeVisible();
    await expect(page).toHaveURL(/super-admin-dashboard/);

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/admin-login/);
    await loginViaUi(page, email, password);
    await expect(page.getByRole('alert')).toContainText('Invalid email or password');
    await loginViaUi(page, email, newPassword);
    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 20_000 });
  });

  test('a login that requires a password change shows nothing else until it is done', async ({ page }) => {
    const { email, password } = await createApprovedAdmin(page.request);
    // The flag is the server's to set (temporary-password accounts); patch it
    // onto this login's answer so the client's handling can be checked alone.
    await page.route('**/api/admin/auth/login', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, requiresPasswordChange: true } });
    });
    await loginViaUi(page, email, password);

    const dialog = page.getByRole('dialog', { name: 'Set a new password to continue' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Current password').fill(password);
    await dialog.getByLabel('New password', { exact: true }).fill('Forced123!new');
    await dialog.getByLabel('Confirm new password').fill('Forced123!new');
    await dialog.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('session handling', () => {
  test('an expired session is sent to the login page', async ({ page, context }) => {
    await setAdminCookie(context, expiredAdminToken());
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 20_000 });
  });

  test('a session that ends mid-use signs the admin out with a message', async ({ page, context }) => {
    await asSuperAdmin(context);
    await page.goto('/super-admin-dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible({ timeout: 20_000 });

    await context.clearCookies();
    await openTab(page, 'Pending Doctors');
    await expect(page.getByText(SESSION_ENDED)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/admin-login/);
  });

  test('when the server cannot be reached the admin is offered a retry, not signed out', async ({ page, context }) => {
    await asSuperAdmin(context);
    await page.route('**/api/admin/auth/status', (route) => route.fulfill({ status: 503, json: { message: 'Service unavailable' } }));
    await page.goto('/super-admin-dashboard');
    await expect(page.getByRole('heading', { name: "Can't reach the server" })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/super-admin-dashboard/);

    await page.unroute('**/api/admin/auth/status');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible({ timeout: 20_000 });
  });

  test('a tab whose data fails to load says so and can retry', async ({ page, context }) => {
    await asSuperAdmin(context);
    await page.route('**/api/admin/approvals/analytics', (route) =>
      route.fulfill({ status: 500, json: { message: 'Analytics are down for maintenance' } }));
    await page.goto('/super-admin-dashboard');
    await expect(page.getByText("Couldn't load analytics")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Analytics are down for maintenance')).toBeVisible();

    await page.unroute('**/api/admin/approvals/analytics');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Session Breakdown')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('bank details', () => {
  test.beforeEach(async ({ context }) => {
    await asSuperAdmin(context);
  });

  test('approving shows the exact details first, then lists the full account number under Approved', async ({ page }) => {
    const doc = await createDoctorWithBankDetails('pending_admin_approval', 'Approve');
    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Bank Details');

    const row = page.locator(`[data-bank-row="${doc.email}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Approve' }).click();

    const dialog = page.getByRole('dialog', { name: 'Approve these bank details?' });
    await expect(dialog).toContainText(doc.accountHolderName);
    await expect(dialog).toContainText(doc.accountNumber);
    await expect(dialog).toContainText('HDFC0001234');
    await expect(dialog).toContainText('ABCDE1234F');

    const approveRequest = page.waitForRequest((r) => r.url().includes(`/bank-details/${doc.userId}/approve`) && r.method() === 'POST');
    await dialog.getByRole('button', { name: 'Approve' }).click();
    const sent = (await approveRequest).postDataJSON();
    expect(new Date(sent.submittedAt).toISOString()).toBe(doc.submittedAt.toISOString());

    await expect(row).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Approved', exact: true }).click();
    const approved = page.locator(`[data-bank-row="${doc.email}"]`);
    await expect(approved).toBeVisible({ timeout: 15_000 });
    await expect(approved).toContainText(doc.accountNumber);

    const profile = await (await db()).collection('doctorprofiles').findOne({ userId: doc.userId });
    expect(profile.payoutApproved).toBe(true);
  });

  test('rejecting asks what to correct and files it under Rejected', async ({ page }) => {
    const doc = await createDoctorWithBankDetails('pending_admin_approval', 'Reject');
    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Bank Details');

    const row = page.locator(`[data-bank-row="${doc.email}"]`);
    await row.getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject these bank details' });
    await expect(dialog.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await dialog.getByLabel('What needs correcting?').fill('The IFSC belongs to a different branch');
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Rejected', exact: true }).click();
    const rejected = page.locator(`[data-bank-row="${doc.email}"]`);
    await expect(rejected).toContainText('The IFSC belongs to a different branch');
  });

  // Needs the server to compare `submittedAt` (contract item 3).
  test('details resubmitted after the list loaded are not approved unseen', async ({ page }) => {
    const doc = await createDoctorWithBankDetails('pending_admin_approval', 'Stale');
    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Bank Details');
    const row = page.locator(`[data-bank-row="${doc.email}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // The doctor replaces their details while the admin is looking.
    const resubmittedAt = new Date();
    await (await db()).collection('doctorprofiles').updateOne(
      { userId: doc.userId },
      { $set: { 'payoutBank.accountNumber': '111122223333', 'payoutBank.submittedAt': resubmittedAt } }
    );

    await row.getByRole('button', { name: 'Approve' }).click();
    const conflict = page.waitForResponse((r) => r.url().includes(`/bank-details/${doc.userId}/approve`));
    await page.getByRole('dialog', { name: 'Approve these bank details?' }).getByRole('button', { name: 'Approve' }).click();
    expect((await conflict).status()).toBe(409);
    // The list reloads with what is actually there now.
    await expect(row).toContainText('111122223333', { timeout: 15_000 });
    const profile = await (await db()).collection('doctorprofiles').findOne({ userId: doc.userId });
    expect(profile.payoutApproved).toBe(false);
  });
});

test.describe('weekly payouts', () => {
  test.beforeEach(async ({ context }) => {
    await asSuperAdmin(context);
  });

  test('generate, lock and record a payout for a delivered session', async ({ page }) => {
    const doc = await createDoctorWithBankDetails('approved', 'Payout');
    await createPayableSession(doc.userId, { daysAgo: 8, price: 1500, platformFee: 300 });

    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Weekly Payouts');

    const preview = page.locator(`[data-preview-row="${doc.email}"]`);
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText('₹ 1,200');
    await expect(preview).toContainText(`HDFC0001234 ••••${doc.accountNumber.slice(-4)}`);

    await page.getByRole('button', { name: 'Generate drafts' }).click();
    const payout = page.locator(`[data-payout-row="${doc.email}"]`);
    const status = payout.locator('[data-status]');
    await expect(status).toHaveText('draft', { timeout: 15_000 });

    await payout.getByRole('button', { name: 'Lock amount' }).click();
    await expect(status).toHaveText('locked', { timeout: 15_000 });
    await expect(payout).toContainText('₹ 1,200');

    await payout.getByRole('button', { name: 'Mark paid' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record this payout as paid' });
    await expect(dialog).toContainText(doc.accountHolderName);
    await expect(dialog).toContainText(`HDFC0001234 · ••••${doc.accountNumber.slice(-4)}`);
    await expect(dialog).toContainText('Bank Details → Approved');
    const confirm = dialog.getByRole('button', { name: 'Confirm paid' });
    await expect(confirm).toBeDisabled();
    const utr = `UTR${stamp()}`;
    await dialog.getByLabel(/Transfer reference/).fill(utr);
    await confirm.click();

    await expect(status).toHaveText('paid', { timeout: 15_000 });
    await expect(payout).toContainText(utr);
    await expect(payout.getByRole('button', { name: 'Mark paid' })).toHaveCount(0);
  });

  test('a lock that stopped half-way can be finished', async ({ page, request }) => {
    const doc = await createDoctorWithBankDetails('approved', 'Resume');
    const sessionId = await createPayableSession(doc.userId, { daysAgo: 9, price: 2000, platformFee: 400 });
    const previewRes = await request.get(`${API_URL}/admin/payments/payouts/preview`, { headers: superAdminHeaders() });
    const { period } = await previewRes.json();

    const database = await db();
    const lockedAt = new Date(Date.now() - 5 * 60_000);
    const { insertedId } = await database.collection('payouts').insertOne({
      doctorId: doc.userId,
      periodKey: period.periodKey,
      periodStart: new Date(period.periodStart),
      periodEnd: new Date(period.periodEnd),
      scheduledPayoutDate: new Date(period.scheduledPayoutDate),
      status: 'locked',
      lockedAt,
      totalsComputedAt: null,
      createdAt: lockedAt,
      updatedAt: lockedAt,
    });
    await database.collection('sessions').updateOne({ _id: sessionId }, { $set: { payoutId: insertedId, payoutClaimedAt: lockedAt } });

    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Weekly Payouts');
    const payout = page.locator(`[data-payout-row="${doc.email}"]`);
    await expect(payout.locator('[data-status]')).toHaveText('lock interrupted', { timeout: 15_000 });
    await expect(payout.getByRole('button', { name: 'Mark paid' })).toHaveCount(0);

    await payout.getByRole('button', { name: 'Finish lock' }).click();
    await expect(payout.locator('[data-status]')).toHaveText('locked', { timeout: 15_000 });
    await expect(payout).toContainText('₹ 1,600');
    await expect(payout.getByRole('button', { name: 'Mark paid' })).toBeVisible();
  });

  // Needs the server to accept an omitted reference when nothing is owed (contract item 4).
  test('a payout of ₹0 can be closed without a transfer reference', async ({ page, request }) => {
    const doc = await createDoctorWithBankDetails('approved', 'Zero');
    const previewRes = await request.get(`${API_URL}/admin/payments/payouts/preview`, { headers: superAdminHeaders() });
    const { period } = await previewRes.json();
    const now = new Date();
    await (await db()).collection('payouts').insertOne({
      doctorId: doc.userId,
      periodKey: period.periodKey,
      periodStart: new Date(period.periodStart),
      periodEnd: new Date(period.periodEnd),
      scheduledPayoutDate: new Date(period.scheduledPayoutDate),
      status: 'locked',
      lockedAt: now,
      totalsComputedAt: now,
      sessionCount: 0,
      grossEarnings: 0,
      adjustmentsTotal: 0,
      netPayable: 0,
      carriedForward: 0,
      bankSnapshot: { accountHolderName: doc.accountHolderName, accountNumberLast4: doc.accountNumber.slice(-4), ifsc: 'HDFC0001234' },
      createdAt: now,
      updatedAt: now,
    });

    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Weekly Payouts');
    const payout = page.locator(`[data-payout-row="${doc.email}"]`);
    await payout.getByRole('button', { name: 'Mark paid' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record this payout as paid' });
    await expect(dialog).toContainText('optional');
    await dialog.getByRole('button', { name: 'Confirm paid' }).click();
    await expect(payout.locator('[data-status]')).toHaveText('paid', { timeout: 15_000 });
  });

  test('the period box applies a week only when asked, and only a well-formed one', async ({ page }) => {
    await page.goto('/super-admin-dashboard');
    const previews: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/payouts/preview')) previews.push(r.url()); });
    await openTab(page, 'Weekly Payouts');
    const box = page.getByLabel('Week');
    await expect(box).toHaveValue(/^\d{4}-W\d{2}$/, { timeout: 15_000 });
    const loaded = previews.length;

    await box.fill('');
    await box.pressSequentially('2026-41');
    expect(previews.length).toBe(loaded);
    await page.getByRole('button', { name: 'Show' }).click();
    await expect(page.getByRole('alert')).toContainText('Use an ISO week like 2026-W41');
    expect(previews.length).toBe(loaded);
    await expect(box).toBeVisible();

    await box.fill('');
    await box.pressSequentially('2026-W40');
    expect(previews.length).toBe(loaded);
    const req = page.waitForRequest((r) => r.url().includes('/payouts/preview?period=2026-W40'));
    await box.press('Enter');
    await req;
    await expect(page.getByText(/2026-W40 · 28 Sept 2026 to 4 Oct 2026|2026-W40 · 28 Sep 2026 to 4 Oct 2026/)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('review moderation', () => {
  async function seedDoctorReview(feedback: string) {
    const { users } = fixtures();
    const database = await db();
    const now = new Date();
    const { insertedId: sessionId } = await database.collection('sessions').insertOne({
      patientId: new ObjectId(users.patientA.id),
      doctorId: new ObjectId(users.doctorA.id),
      startsAt: new Date(now.getTime() - 3 * 864e5),
      endsAt: new Date(now.getTime() - 3 * 864e5 + 3600_000),
      duration: 60,
      price: 1500,
      status: 'completed',
      paymentStatus: 'not_required',
      createdAt: now,
      updatedAt: now,
    });
    await database.collection('reviews').insertOne({
      sessionId,
      patientId: new ObjectId(users.patientA.id),
      doctorId: new ObjectId(users.doctorA.id),
      rating: 4,
      feedback,
      positives: '',
      improvements: '',
      wouldRecommend: true,
      reviewType: 'doctor',
      isPublic: true,
      approvedForDisplay: true,
      reviewStatus: 'pending',
      adminNotes: '',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async function publiclyListed(page: Page, feedback: string): Promise<boolean> {
    const res = await page.request.get(`${API_URL}/reviews/doctor/${fixtures().users.doctorA.id}?limit=50`);
    const body = await res.json();
    return (body.reviews as Array<{ feedback: string }>).some((r) => r.feedback === feedback);
  }

  test('a normal admin hides and shows a doctor review, and the public profile agrees', async ({ page }) => {
    const { users } = fixtures();
    const feedback = `E2E moderation review ${stamp()}`;
    await seedDoctorReview(feedback);
    expect(await publiclyListed(page, feedback)).toBe(true);

    await loginViaUi(page, users.admin.email, users.admin.password);
    await openTab(page, 'Reviews');
    const card = page.locator('[data-review-card]').filter({ hasText: feedback });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-visibility]')).toHaveText('Public');

    await card.getByRole('button', { name: 'Hide' }).click();
    await expect(card.locator('[data-visibility]')).toHaveText('Hidden', { timeout: 15_000 });
    expect(await publiclyListed(page, feedback)).toBe(false);

    await card.getByRole('button', { name: 'Show' }).click();
    await expect(card.locator('[data-visibility]')).toHaveText('Public', { timeout: 15_000 });
    expect(await publiclyListed(page, feedback)).toBe(true);

    await card.getByRole('button', { name: 'Flag' }).click();
    await expect(card).toContainText('flagged', { timeout: 15_000 });
    await expect(card.locator('[data-visibility]')).toHaveText('Hidden');
    expect(await publiclyListed(page, feedback)).toBe(false);

    await card.getByRole('button', { name: /Unflag/ }).click();
    await expect(card).toContainText('reviewed', { timeout: 15_000 });
    await expect(card.locator('[data-visibility]')).toHaveText('Public');
    expect(await publiclyListed(page, feedback)).toBe(true);
  });

  // Needs the server's reviewType filter (contract item 7).
  test('the type filter separates doctor and platform reviews', async ({ page, context }) => {
    const feedback = `E2E typed review ${stamp()}`;
    await seedDoctorReview(feedback);
    await asSuperAdmin(context);
    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Reviews');
    await expect(page.locator('[data-review-card]').filter({ hasText: feedback })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Review type').selectOption('platform');
    await expect(page.locator('[data-review-card]').filter({ hasText: feedback })).toHaveCount(0, { timeout: 15_000 });
    await page.getByLabel('Review type').selectOption('doctor');
    await expect(page.locator('[data-review-card]').filter({ hasText: feedback })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('articles', () => {
  test.beforeEach(async ({ context }) => {
    await asSuperAdmin(context);
  });

  async function slugOf(page: Page, title: string): Promise<string> {
    const res = await page.request.get(`${API_URL}/articles/admin/all?status=All&search=${encodeURIComponent(title)}`, { headers: superAdminHeaders() });
    const body = await res.json();
    return (body.articles as Array<{ title: string; slug: string }>).find((a) => a.title === title)!.slug;
  }

  const isPublic = async (page: Page, slug: string) => (await page.request.get(`${API_URL}/articles/${slug}`)).status() === 200;

  async function findRow(page: Page, title: string) {
    await page.getByLabel('Search articles').fill(title);
    const row = page.locator(`[data-article-row="${title}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    return row;
  }

  test('write → publish → live → unpublish → gone, with honest buttons in the editor', async ({ page }) => {
    const title = `E2E lifecycle article ${stamp()}`;
    await page.goto('/super-admin-dashboard/articles/new');
    await page.getByLabel('Article Title').fill(title);
    await page.getByLabel('Short Description').fill('A test article that goes live and comes back down.');
    await page.locator('.ql-editor').click();
    await page.keyboard.type('Numbered steps follow.');
    await expect(page.getByRole('button', { name: 'Save as draft' })).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();

    await expect(page.getByText('Article published')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Manage Articles' })).toBeVisible();
    const row = await findRow(page, title);
    await expect(row).toContainText('Published');

    const slug = await slugOf(page, title);
    expect(await isPublic(page, slug)).toBe(true);
    await page.goto(`/resources/articles/${slug}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });

    // Unpublish from the list.
    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Articles');
    const listed = await findRow(page, title);
    await listed.getByRole('button', { name: 'Unpublish' }).click();
    await expect(listed).toContainText('Draft', { timeout: 15_000 });
    expect(await isPublic(page, slug)).toBe(false);

    // The editor names what each button does to a live article.
    await listed.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByTestId('article-status')).toHaveText('Draft', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByTestId('article-status')).toHaveText('Published', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Update' })).toBeVisible();
    expect(await isPublic(page, slug)).toBe(true);

    await page.getByRole('button', { name: 'Unpublish & save as draft' }).click();
    await expect(page.getByTestId('article-status')).toHaveText('Draft', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Save as draft' })).toBeVisible();
    expect(await isPublic(page, slug)).toBe(false);
  });

  test('archive is recoverable: Archived filter → restore to draft', async ({ page, request }) => {
    const title = `E2E archive article ${stamp()}`;
    const created = await apiSend(request, 'POST', '/articles/admin', {
      title, description: 'Archive me.', content: '<p>Body</p>', category: 'Depression', author: 'E2E', status: 'published',
    }, superAdminHeaders());
    expect(created.status(), await created.text()).toBe(201);
    const slug = (await created.json()).article.slug;

    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Articles');
    const row = await findRow(page, title);
    await row.getByRole('button', { name: 'Archive' }).click();
    const dialog = page.getByRole('dialog', { name: 'Archive this article?' });
    await expect(dialog).toContainText('will be removed from the site');
    await expect(dialog).toContainText('Archived');
    await dialog.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText(/was archived/)).toBeVisible({ timeout: 15_000 });
    expect(await isPublic(page, slug)).toBe(false);

    await page.getByLabel('Status').selectOption('archived');
    const archived = page.locator(`[data-article-row="${title}"]`);
    await expect(archived).toContainText('Archived', { timeout: 15_000 });
    await archived.getByRole('button', { name: 'Restore to draft' }).click();
    await expect(archived).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page.getByLabel('Status')).toHaveValue('active');
    const restored = await findRow(page, title);
    await expect(restored).toContainText('Draft');
  });

  // Needs the server's default admin list to leave archived articles out (contract item 8).
  test('archived articles leave the default list', async ({ page, request }) => {
    const title = `E2E archived default ${stamp()}`;
    const created = await apiSend(request, 'POST', '/articles/admin', {
      title, description: 'Gone from the default list.', content: '<p>Body</p>', category: 'Depression', author: 'E2E', status: 'draft',
    }, superAdminHeaders());
    expect(created.status()).toBe(201);

    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Articles');
    const row = await findRow(page, title);
    await row.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('dialog', { name: 'Archive this article?' }).getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText(/was archived/)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`[data-article-row="${title}"]`)).toHaveCount(0, { timeout: 15_000 });
  });

  test('the public list offers every category the editor does, and pages', async ({ page }) => {
    await page.goto('/resources/articles');
    await page.getByRole('button', { name: /more/ }).click();
    await expect(page.getByRole('button', { name: 'Anger & Frustration' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confusion about identity' })).toBeVisible();
  });
});

test.describe("the server's explanation reaches the admin", () => {
  test.beforeEach(async ({ context }) => {
    await asSuperAdmin(context);
  });

  test('a refused doctor removal shows why, and the doctor stays', async ({ page }) => {
    const { users } = fixtures();
    const message = 'This doctor has sessions — reject them instead of removing them.';
    // Mocked: the real refusal (contract item 9) is the server's change.
    await page.route('**/api/admin/approvals/doctors/*', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 409, json: { message } })
        : route.fallback());
    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Pending Doctors');
    await page.getByRole('button', { name: /^All Doctors/ }).click();
    const row = page.locator(`[data-doctor-row="${users.doctorA.email}"]`);
    await row.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog', { name: 'Remove this doctor?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText(message)).toBeVisible();
    await expect(row).toBeVisible();
  });

  test('a refused payout lock shows why', async ({ page }) => {
    const message = "This therapist's bank details aren't approved, so the payout can't be locked.";
    const fakeId = new ObjectId().toString();
    await page.route('**/api/admin/payments/payouts?period=*', (route) =>
      route.fulfill({ json: { success: true, payouts: [{ _id: fakeId, status: 'draft', doctorId: { firstName: 'Mock', lastName: 'Payee', email: 'mock.payee@veraawell.test' } }] } }));
    await page.route(`**/api/admin/payments/payouts/${fakeId}/lock`, (route) => route.fulfill({ status: 409, json: { message } }));
    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Weekly Payouts');
    await page.locator('[data-payout-row="mock.payee@veraawell.test"]').getByRole('button', { name: 'Lock amount' }).click();
    await expect(page.getByText(message)).toBeVisible();
  });

  test('a refused refund retry asks first and shows why', async ({ page }) => {
    const sessionId = new ObjectId().toString();
    await page.route('**/api/admin/payments/sessions/failed-refunds', (route) => route.fulfill({
      json: { success: true, count: 1, sessions: [{
        _id: sessionId, patientName: 'Mock Patient', patientEmail: 'mock.patient@veraawell.test', doctorName: 'Dr. Mock',
        sessionDate: '2026-10-01T00:00:00.000Z', sessionTime: '10:00 AM', price: 2000, refundAmount: 1000,
        paymentStatus: 'refund_failed', failureReason: 'The payment is too old to refund',
      }] },
    }));
    await page.route(`**/api/admin/payments/sessions/${sessionId}/retry-refund`, (route) =>
      route.fulfill({ status: 502, json: { message: 'Refund retry failed: gateway timeout' } }));
    await page.goto('/super-admin-dashboard');
    await openTab(page, 'Revenue');

    const row = page.locator(`[data-refund-row="${sessionId}"]`);
    await expect(row).toContainText('₹ 1,000');
    await expect(row).toContainText('The payment is too old to refund');
    await row.getByRole('button', { name: 'Retry refund' }).click();
    const dialog = page.getByRole('dialog', { name: 'Retry this refund?' });
    await expect(dialog).toContainText('₹ 1,000');
    await dialog.getByRole('button', { name: 'Retry refund' }).click();
    await expect(page.getByText('Refund retry failed: gateway timeout')).toBeVisible();
  });
});
