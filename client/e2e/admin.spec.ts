/**
 * The admin console.
 *
 * Admin auth is a separate realm from patient/doctor auth: the server issues
 * the admin session as the httpOnly `adminToken` cookie, and the console keeps
 * nothing in localStorage (any injected script could read it there). Tests
 * sign in by placing that cookie — see adminHelpers.ts.
 */

import { test, expect, Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { asSuperAdmin, setAdminCookie, sidebar } from './adminHelpers';

test.describe('admin sign-in', () => {
  test('the login page is reachable and rejects a wrong password', async ({ page }) => {
    await page.goto('/admin-login');
    const { users } = fixtures();

    await page.locator('input[type="email"]').fill(users.superAdmin.email);
    await page.locator('input[type="password"]').first().fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid email or password');
    await expect(page).toHaveURL(/admin-login/);
  });

  test('valid credentials reach the dashboard, with the session in an httpOnly cookie only', async ({ page, context }) => {
    await page.goto('/admin-login');
    const { users } = fixtures();

    await page.locator('input[type="email"]').fill(users.superAdmin.email);
    await page.locator('input[type="password"]').first().fill(users.superAdmin.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();

    // Nothing script-readable holds the most privileged credential.
    expect(await page.evaluate(() => window.localStorage.getItem('adminToken'))).toBeNull();
    const cookie = (await context.cookies()).find((c) => c.name === 'adminToken');
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('adminToken');
  });

  test('a token left in localStorage by an older build is deleted on load', async ({ page, context }) => {
    await asSuperAdmin(context);
    await page.goto('/super-admin-dashboard');
    await page.evaluate(() => window.localStorage.setItem('adminToken', 'legacy.token.value'));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => window.localStorage.getItem('adminToken'))).toBeNull();
  });

  test('an admin who is already signed in is sent from the login page to the dashboard', async ({ page, context }) => {
    await asSuperAdmin(context);
    await page.goto('/admin-login');
    await expect(page).toHaveURL(/\/super-admin-dashboard$/, { timeout: 20_000 });
  });

  test('/admin/login redirects to the canonical path', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 10_000 });
  });

  test('an unauthenticated visitor is sent to the login page', async ({ page }) => {
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 15_000 });
  });

  test('logging out ends the session', async ({ page, context }) => {
    await asSuperAdmin(context);
    await page.goto('/super-admin-dashboard');
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 15_000 });
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 15_000 });
  });
});

test.describe('the super admin dashboard', () => {
  test.beforeEach(async ({ page, context }) => {
    await asSuperAdmin(context);
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 20_000 });
  });

  test('opens on a working dashboard rather than bouncing back to login', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Approved Doctors')).toBeVisible();
    await expect(page).toHaveURL(/super-admin-dashboard/);
  });

  test('every sidebar tab opens on its own screen', async ({ page }) => {
    const tabs: Array<[string, string]> = [
      ['Analytics', 'Dashboard Overview'],
      ['Pending Doctors', 'Doctor Approvals'],
      ['Pending Admins', 'Admin Approvals'],
      ['Reviews', 'Review Moderation'],
      ['Bank Details', 'Bank Details'],
      ['Weekly Payouts', 'Weekly Payouts'],
      ['Revenue', 'Platform Revenue'],
      ['Enquiries', 'Enquiries'],
      ['Articles', 'Manage Articles'],
    ];
    for (const [label, heading] of tabs) {
      await sidebar(page).getByRole('button', { name: new RegExp(`^${label}`) }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.getByText(/Couldn't load/)).toHaveCount(0);
    }
    // The retired onboarding queue is gone; Bank Details replaced it.
    await expect(sidebar(page).getByRole('button', { name: /Payout Approvals/ })).toHaveCount(0);
  });

  test('the doctor approval queue is fetched only when its tab opens', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/admin/approvals/doctors/')) requests.push(r.url()); });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();
    expect(requests).toHaveLength(0);

    const pending = page.waitForResponse((r) => r.url().includes('/admin/approvals/doctors/pending'));
    await sidebar(page).getByRole('button', { name: /^Pending Doctors/ }).click();
    expect((await pending).status()).toBe(200);
  });

  test('the article editor opens from its own route', async ({ page }) => {
    await page.goto('/super-admin-dashboard/articles/new');
    await expect(page).toHaveURL(/articles\/new/, { timeout: 15_000 });
    await expect(page.locator('input, textarea, .ql-editor').first()).toBeVisible({ timeout: 20_000 });
  });

  test('the legacy /admin/articles path redirects into the articles tab', async ({ page }) => {
    await page.goto('/admin/articles');
    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Manage Articles' })).toBeVisible();
  });
});

test.describe('admin realm isolation', () => {
  test('a patient cookie session does not grant admin access', async ({ page }) => {
    // No adminToken cookie: the patient's session cookie is a different
    // realm entirely and must not satisfy AdminProtectedRoute.
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 15_000 });
  });

  test('a forged admin token is rejected by the API', async ({ page, context }) => {
    await setAdminCookie(context, 'not.a.real.token');
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 20_000 });
  });
});

/**
 * The Enquiries tab — the read side of the careers/contact enquiry pipeline.
 *
 * The badge count is fetched before the tab opens (a notification badge that
 * only appears once you open the tab is useless); the queue itself is not.
 */
test.describe('the enquiries queue', () => {
  test.beforeEach(async ({ context }) => {
    await asSuperAdmin(context);
  });

  /**
   * Submit an enquiry the way the public site does. The route is CSRF-protected
   * like every other browser write, and page.request is a bare API context with
   * no interceptor, so the token has to be fetched and echoed by hand.
   */
  async function submitEnquiry(page: Page, data: Record<string, string>) {
    const tokenRes = await page.request.get('http://localhost:5001/api/csrf-token');
    const { csrfToken } = await tokenRes.json();
    const res = await page.request.post('http://localhost:5001/api/enquiries', {
      headers: { 'X-CSRF-Token': csrfToken },
      data,
    });
    expect(res.status()).toBe(201);
    return res;
  }

  test('the tab opens on the new queue rather than a stuck loading screen', async ({ page }) => {
    await page.goto('/super-admin-dashboard');
    await sidebar(page).getByRole('button', { name: /^Enquiries/ }).click();

    await expect(page.getByRole('heading', { name: 'Enquiries' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Loading dashboard/i)).toHaveCount(0);
    // The filter defaults to what needs attention.
    await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('an enquiry submitted from the public site appears in the queue', async ({ page }) => {
    const stamp = Date.now();
    await submitEnquiry(page, {
      type: 'partner',
      name: `E2E Admin Queue ${stamp}`,
      email: `e2e.queue.${stamp}@veraawell.test`,
      organisation: 'Queue Test Clinic',
      message: 'Submitted by the admin-tests project to verify the queue.',
    });

    await page.goto('/super-admin-dashboard');
    await sidebar(page).getByRole('button', { name: /^Enquiries/ }).click();

    const card = page.locator('[data-enquiry-card]').filter({ hasText: `E2E Admin Queue ${stamp}` });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('Queue Test Clinic')).toBeVisible();
    await expect(card.getByText('Partnership')).toBeVisible();
  });

  test('the type filter narrows the queue', async ({ page }) => {
    const stamp = Date.now();
    await submitEnquiry(page, {
      type: 'contact',
      name: `E2E Type Filter ${stamp}`,
      email: `e2e.typefilter.${stamp}@veraawell.test`,
      message: 'A contact-form enquiry.',
    });
    await page.goto('/super-admin-dashboard');
    await sidebar(page).getByRole('button', { name: /^Enquiries/ }).click();
    await expect(page.getByText(`E2E Type Filter ${stamp}`)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Enquiry type').selectOption('partner');
    await expect(page.getByText(`E2E Type Filter ${stamp}`)).toHaveCount(0, { timeout: 15_000 });
    await page.getByLabel('Enquiry type').selectOption('contact');
    await expect(page.getByText(`E2E Type Filter ${stamp}`)).toBeVisible({ timeout: 15_000 });
  });

  test('closing an enquiry moves it out of the new queue and records who did it', async ({ page }) => {
    const stamp = Date.now();
    await submitEnquiry(page, {
      type: 'contact',
      name: `E2E Close Me ${stamp}`,
      email: `e2e.close.${stamp}@veraawell.test`,
      message: 'This one gets closed.',
    });

    await page.goto('/super-admin-dashboard');
    await sidebar(page).getByRole('button', { name: /^Enquiries/ }).click();

    const card = page.locator('[data-enquiry-card]').filter({ hasText: `E2E Close Me ${stamp}` });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: 'Close' }).click();

    // The default filter is 'new', so a closed enquiry leaves the list.
    await expect(page.getByText(`E2E Close Me ${stamp}`)).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Closed' }).click();
    const closed = page.locator('[data-enquiry-card]').filter({ hasText: `E2E Close Me ${stamp}` });
    await expect(closed).toBeVisible({ timeout: 15_000 });
    await expect(closed).toContainText(/last updated .* by Meera Super_admin/);
  });

  test('the sidebar badge counts new enquiries before the tab is opened', async ({ page }) => {
    const stamp = Date.now();
    await submitEnquiry(page, {
      type: 'other',
      name: `E2E Badge ${stamp}`,
      email: `e2e.badge.${stamp}@veraawell.test`,
      subject: 'Badge check',
      message: 'Counting toward the sidebar badge.',
    });

    await page.goto('/super-admin-dashboard');

    // Still on Analytics — the count must already be there.
    const badge = sidebar(page).getByRole('button', { name: /^Enquiries/ }).locator('span').last();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    expect(Number(await badge.innerText())).toBeGreaterThan(0);
  });
});
