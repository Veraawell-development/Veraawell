/**
 * Public Pages E2E Tests (no auth required)
 * Covers: Landing, About, Services, FAQ, Contact, Resources,
 *         Choose Professional, Doctor Profile, Articles
 */

import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('loads and has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Veraawell/i);
  });

  test('landing page renders some content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(100);
  });
});

test.describe('Navigation — Public Pages', () => {
  test('/about page loads', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/about/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('/services page loads', async ({ page }) => {
    await page.goto('/services');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('/faq page loads with FAQ content', async ({ page }) => {
    await page.goto('/faq');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 });
    // FAQ accordion: each item is a div containing a question button
    // The FAQ page renders plain <button> elements for each question
    const faqButton = page.locator('button').filter({ hasText: 'What is Veraawell' }).first();
    await expect(faqButton).toBeVisible({ timeout: 5000 });
    // Clicking a question should expand the answer
    await faqButton.click();
    await expect(page.locator('text=comprehensive mental health platform').first()).toBeVisible({ timeout: 3000 });
  });

  test('/contact page has contact form', async ({ page }) => {
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('form, input[type="email"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('/privacy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('/terms page loads', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('/resources page loads', async ({ page }) => {
    await page.goto('/resources');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('/resources/articles page loads', async ({ page }) => {
    await page.goto('/resources/articles');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1, h2, article, .article-card').first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('404 Page', () => {
  test('unknown route shows 404 page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz-abc');
    await page.waitForLoadState('networkidle');
    // NotFoundPage renders "404" and "Page Not Found" text
    await expect(page.locator('text=Page Not Found').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Choose Professional Page', () => {
  test('/choose-professional page loads with doctor list or loading', async ({ page }) => {
    await page.goto('/choose-professional');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // allow API fetch
    // Either doctor cards OR a loading state OR an empty state
    const content = page.locator('.doctor-card, [data-testid="doctor-card"], .grid, h1, h2').first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Navbar', () => {
  test('navbar has login link when unauthenticated', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    const loginLink = page.locator('a[href="/login"], button:has-text("Login"), button:has-text("Sign In"), a:has-text("Login")').first();
    await expect(loginLink).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Contact Form Validation', () => {
  test('submitting empty form shows validation', async ({ page }) => {
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');
    const submitBtn = page.locator('button[type="submit"], button:has-text("Send")').first();
    await submitBtn.click();
    // Should not navigate away
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/contact/);
  });
});

/**
 * The /contact form used to be a 1-second setTimeout that cleared the fields
 * and claimed success without making any request — every message typed there
 * was silently discarded. These assert it now reaches the API and that success
 * is reported only on a real 2xx.
 */
test.describe('Contact form', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');
  });

  const fill = async (page: import('@playwright/test').Page, message: string) => {
    await page.getByPlaceholder('Jane Doe').fill('E2E Contact');
    await page.getByPlaceholder('jane@example.com').fill(`e2e.contact.${Date.now()}@veraawell.test`);
    await page.getByPlaceholder('How can we help you?').fill(message);
  };

  test('a message reaches POST /api/enquiries and clears the form', async ({ page }) => {
    await fill(page, 'Do you offer sessions in Kannada?');

    const posted = page.waitForResponse((res) =>
      res.url().includes('/api/enquiries') && res.request().method() === 'POST');

    await page.getByRole('button', { name: /Send Message/i }).click();

    const response = await posted;
    expect(response.status()).toBe(201);
    expect((await response.json()).data.type).toBe('contact');

    await expect(page.getByText(/sent successfully/i)).toBeVisible();
    await expect(page.getByPlaceholder('How can we help you?')).toHaveValue('');
  });

  test('a server rejection is surfaced as an error, not a false success', async ({ page }) => {
    await page.route('**/api/enquiries', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: 'Validation failed', errors: { email: 'Invalid email format' } }),
    }));

    await fill(page, 'This should not report success.');
    await page.getByRole('button', { name: /Send Message/i }).click();

    await expect(page.getByText('Invalid email format')).toBeVisible();
    await expect(page.getByText(/sent successfully/i)).toHaveCount(0);
    // The old implementation cleared the fields regardless of outcome.
    await expect(page.getByPlaceholder('How can we help you?')).toHaveValue('This should not report success.');
  });

  test('blank required fields never reach the API', async ({ page }) => {
    // Name, email and message all carry the HTML5 `required` attribute, so the
    // browser blocks submission before handleSubmit runs. The guard inside
    // handleSubmit is the second line of defence, not the first — what matters
    // here is that nothing is posted and the page does not claim success.
    let requests = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/enquiries') && req.method() === 'POST') requests += 1;
    });

    await page.getByRole('button', { name: /Send Message/i }).click();
    await page.waitForTimeout(1500);

    expect(requests).toBe(0);
    await expect(page.getByText(/sent successfully/i)).toHaveCount(0);
    await expect(page.getByPlaceholder('Jane Doe')).toHaveJSProperty('validity.valid', false);
  });
});
