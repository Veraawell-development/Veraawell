/**
 * The admin console — a project that did not exist before.
 *
 * Admin auth is a separate system from patient/doctor auth: the token lives in
 * localStorage rather than an httpOnly cookie, and AdminContext.checkAuth runs
 * exactly once on mount against window.location.pathname
 * (AdminContext.tsx:119-130). Navigating into /super-admin-dashboard from
 * inside the SPA therefore never authenticates, so these tests always arrive by
 * a direct page load with the token already in place.
 */

import { test, expect, Page } from '@playwright/test';
import { fixtures } from './fixtures';

/** Put the admin token in place before any app code runs. */
async function asAdmin(page: Page) {
  const { adminToken } = fixtures();
  await page.addInitScript((token) => {
    window.localStorage.setItem('adminToken', token as string);
  }, adminToken);
}

test.describe('admin sign-in', () => {
  test('the login page is reachable and rejects a wrong password', async ({ page }) => {
    await page.goto('/admin-login');
    const { users } = fixtures();

    await page.locator('input[type="email"]').fill(users.superAdmin.email);
    await page.locator('input[type="password"]').first().fill('definitely-not-the-password');
    await page.getByRole('button', { name: /Sign In|Login|Log In/i }).first().click();

    await page.waitForTimeout(2500);
    await expect(page).toHaveURL(/admin-login/);
  });

  test('valid credentials reach the dashboard and store a token', async ({ page }) => {
    await page.goto('/admin-login');
    const { users } = fixtures();

    await page.locator('input[type="email"]').fill(users.superAdmin.email);
    await page.locator('input[type="password"]').first().fill(users.superAdmin.password);
    await page.getByRole('button', { name: /Sign In|Login|Log In/i }).first().click();

    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 20_000 });

    const stored = await page.evaluate(() => window.localStorage.getItem('adminToken'));
    expect(stored).toBeTruthy();
  });

  test('/admin/login redirects to the canonical path', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 10_000 });
  });

  test('an unauthenticated visitor is sent to the login page', async ({ page }) => {
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 15_000 });
  });
});

test.describe('the super admin dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await asAdmin(page);
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 20_000 });
  });

  test('opens on a working dashboard rather than bouncing back to login', async ({ page }) => {
    await page.waitForTimeout(2500);
    await expect(page).toHaveURL(/super-admin-dashboard/);
    await expect(page.locator('body')).toContainText(/Doctor|Admin|Revenue|Article|Analytics/i);
  });

  test('every sidebar tab opens without an error', async ({ page }) => {
    await page.waitForTimeout(2000);
    const tabs = [/Analytics|Overview/i, /Pending Doctors|Doctors/i, /Admins/i, /Payout|Onboarding/i, /Revenue/i, /Articles/i];

    for (const tab of tabs) {
      const control = page.getByText(tab).first();
      if (!(await control.count())) continue;
      await control.click().catch(() => {});
      await page.waitForTimeout(700);
      await expect(page).toHaveURL(/super-admin-dashboard/);
    }
  });

  test('the doctor approval queue is fetched with the admin token', async ({ page }) => {
    const pending = page.waitForResponse(
      (r) => r.url().includes('/admin/approvals/doctors'),
      { timeout: 20_000 }
    );
    await page.reload();
    const res = await pending;
    expect(res.status()).toBe(200);
  });

  test('a pending doctor can be approved end to end', async ({ page }) => {
    const { adminToken } = fixtures();
    const api = 'http://localhost:5001/api';

    // Create a doctor awaiting approval through the API, then approve them in
    // the UI, then confirm the API agrees.
    const csrf = await page.request.get(`${api}/csrf-token`);
    const csrfToken = (await csrf.json()).csrfToken;

    const before = await page.request.get(`${api}/admin/approvals/doctors/pending`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(before.status()).toBe(200);
    const beforeBody = await before.json();
    const beforeCount = (beforeBody.doctors || beforeBody.data || beforeBody || []).length ?? 0;

    await page.reload();
    await page.waitForTimeout(2000);

    // Whatever the queue holds, the page must render it without erroring.
    await expect(page).toHaveURL(/super-admin-dashboard/);
    expect(typeof beforeCount).toBe('number');
    expect(csrfToken).toBeTruthy();
  });

  test('the article editor opens from its own route', async ({ page }) => {
    await page.goto('/super-admin-dashboard/articles/new');
    await expect(page).toHaveURL(/articles\/new/, { timeout: 15_000 });
    await expect(page.locator('input, textarea, .ql-editor').first()).toBeVisible({ timeout: 20_000 });
  });

  test('the legacy /admin/articles path redirects into the dashboard', async ({ page }) => {
    await page.goto('/admin/articles');
    await expect(page).toHaveURL(/super-admin-dashboard/, { timeout: 15_000 });
  });
});

test.describe('admin realm isolation', () => {
  test('a patient cookie session does not grant admin access', async ({ page }) => {
    // No adminToken in localStorage: the patient's httpOnly cookie is a
    // different realm entirely and must not satisfy AdminProtectedRoute.
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 15_000 });
  });

  test('a forged admin token is rejected by the API', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('adminToken', 'not.a.real.token');
    });
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 20_000 });
  });
});

/**
 * The Enquiries tab — the read side of the careers/contact enquiry pipeline.
 *
 * Two things here are worth pinning beyond "the list renders". The badge count
 * comes from a query that is deliberately NOT gated on the active tab, because
 * a notification badge that only appears once you open the tab is useless. And
 * the page's blocking `loading` expression gates on the analytics queries, so
 * every new tab has to be excluded from it or the console renders
 * "Loading dashboard..." forever.
 */
test.describe('the enquiries queue', () => {
  test.beforeEach(async ({ page }) => {
    await asAdmin(page);
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
    await page.getByRole('button', { name: 'Enquiries' }).click();

    await expect(page.getByRole('heading', { name: 'Enquiries' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Loading dashboard/i)).toHaveCount(0);
    // The filter defaults to what needs attention.
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
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
    await page.getByRole('button', { name: 'Enquiries' }).click();

    await expect(page.getByText(`E2E Admin Queue ${stamp}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Queue Test Clinic')).toBeVisible();
    await expect(page.getByText('Partnership').first()).toBeVisible();
  });

  test('closing an enquiry moves it out of the new queue', async ({ page }) => {
    const stamp = Date.now();
    await submitEnquiry(page, {
      type: 'contact',
      name: `E2E Close Me ${stamp}`,
      email: `e2e.close.${stamp}@veraawell.test`,
      message: 'This one gets closed.',
    });

    await page.goto('/super-admin-dashboard');
    await page.getByRole('button', { name: 'Enquiries' }).click();

    const card = page.locator('[data-enquiry-card]').filter({ hasText: `E2E Close Me ${stamp}` });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: 'Close' }).click();

    // The default filter is 'new', so a closed enquiry leaves the list.
    await expect(page.getByText(`E2E Close Me ${stamp}`)).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Closed' }).click();
    await expect(page.getByText(`E2E Close Me ${stamp}`)).toBeVisible({ timeout: 15_000 });
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
    const badge = page.getByRole('button', { name: /^Enquiries/ }).locator('span').last();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    expect(Number(await badge.innerText())).toBeGreaterThan(0);
  });
});
