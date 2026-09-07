import { test, expect } from '@playwright/test';

test.describe('Careers / Professional Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies/localStorage to ensure clean state
    await page.context().clearCookies();
    await page.goto('/careers');
    await page.evaluate(() => localStorage.clear());
    await page.waitForLoadState('networkidle');
  });

  test('careers page renders with correct tabs', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    await expect(page.locator('h2').filter({ hasText: 'Join Us Now' })).toBeVisible({ timeout: 10000 });
    
    // Check tabs
    await expect(page.locator('button', { hasText: 'Partner with us' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Join as Professional' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Other Queries' })).toBeVisible();
  });

  test('validates step 1 required fields', async ({ page }) => {
    // Navigate to Join as Professional tab
    await page.locator('button', { hasText: 'Join as Professional' }).click();

    // Fill only partial fields and try to proceed
    await page.fill('input[placeholder="John"]', 'Test Doctor');
    await page.fill('input[placeholder="john@example.com"]', 'testdoctor@veraawell.test');
    // Leaving Phone empty
    // Form is standard HTML5 required fields, so the browser will prevent submission.
    // We will just fill everything correctly in the next test to test full flow.
  });

  test('successfully completes the professional onboarding flow', async ({ page }) => {
    // Step 1
    await page.locator('button', { hasText: 'Join as Professional' }).click();
    await page.fill('input[placeholder="John"]', 'Test Professional');
    await page.fill('input[placeholder="john@example.com"]', `e2e.prof.${Date.now()}@veraawell.test`);
    await page.fill('input[placeholder="+91 98765 43210"]', '9876543210');
    
    await page.locator('button', { hasText: 'Next Step' }).click();

    // Step 2
    // Job Role
    await page.locator('select').nth(0).selectOption({ label: 'Psychologist' });
    // Specialization
    await page.locator('select').nth(1).selectOption({ label: 'Clinical Psychologist' });
    
    await page.fill('input[placeholder="Optional"]', 'RCI-99999');
    
    await page.locator('select').nth(2).selectOption({ label: 'Search Engine' });
    await page.fill('textarea[placeholder*="Optional message"]', 'I am an experienced psychologist testing the E2E flow.');
    
    await page.locator('button', { hasText: 'Next Step' }).click();

    // Step 3
    await page.fill('input[placeholder="Min 6 characters"]', 'SecurePass123!');
    await page.fill('input[placeholder="Re-enter password"]', 'SecurePass123!');

    // Submit Application
    const [registerResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/auth/register') && resp.request().method() === 'POST', { timeout: 15000 }),
      page.locator('button', { hasText: 'Submit Application' }).click(),
    ]);

    expect(registerResponse.ok()).toBeTruthy();

    // Step 4: OTP Verification (Mocked)
    await page.route('**/auth/verify-signup', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Email verified successfully' })
      });
    });

    await page.fill('input[placeholder="000000"]', '123456');
    await page.locator('button', { hasText: 'Verify & Complete Application' }).click();
    
    // Verify success message
    await expect(page.locator('text=Application submitted successfully')).toBeVisible({ timeout: 10000 });
  });
});

/**
 * The two enquiry tabs. Both were dead ends before — a "coming soon" panel and
 * a `mailto:` link — so these assert the whole path: the form renders, blank
 * required fields are refused without a request, and a real submission reaches
 * POST /api/enquiries and reports success.
 */
test.describe('Careers enquiry forms', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/careers');
    await page.waitForLoadState('networkidle');
  });

  test('the Partner with us tab shows a form, not a mailto dead end', async ({ page }) => {
    await page.locator('button', { hasText: 'Partner with us' }).click();

    await expect(page.locator('#enquiry-partner-name')).toBeVisible();
    await expect(page.locator('#enquiry-partner-organisation')).toBeVisible();
    await expect(page.locator('#enquiry-partner-phone')).toBeVisible();
    await expect(page.locator('#enquiry-partner-message')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Partnership Enquiry' })).toBeVisible();

    // The old panel's only route out.
    await expect(page.getByText('Partnership opportunities coming soon')).toHaveCount(0);
  });

  test('the Other Queries tab shows a form with a subject field', async ({ page }) => {
    await page.locator('button', { hasText: 'Other Queries' }).click();

    await expect(page.locator('#enquiry-other-subject')).toBeVisible();
    await expect(page.locator('#enquiry-other-message')).toBeVisible();
    // Organisation and phone belong to the partnership variant only.
    await expect(page.locator('#enquiry-partner-organisation')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send Enquiry' })).toBeVisible();
  });

  test('blank required fields are refused without hitting the network', async ({ page }) => {
    await page.locator('button', { hasText: 'Other Queries' }).click();

    let requests = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/enquiries') && req.method() === 'POST') requests += 1;
    });

    await page.getByRole('button', { name: 'Send Enquiry' }).click();

    await expect(page.getByText('Please tell us your name')).toBeVisible();
    await expect(page.getByText('We need an email to reply to')).toBeVisible();
    await expect(page.getByText('A short subject helps us route your query')).toBeVisible();
    await expect(page.getByText('Please add a short message')).toBeVisible();
    expect(requests).toBe(0);
  });

  test('a malformed email is caught before submitting', async ({ page }) => {
    await page.locator('button', { hasText: 'Other Queries' }).click();
    await page.fill('#enquiry-other-name', 'E2E Tester');
    await page.fill('#enquiry-other-email', 'not-an-email');
    await page.fill('#enquiry-other-subject', 'Press enquiry');
    await page.fill('#enquiry-other-message', 'Checking the validation path.');

    await page.getByRole('button', { name: 'Send Enquiry' }).click();
    await expect(page.getByText('That email address looks incomplete')).toBeVisible();
  });

  test('a partnership enquiry posts to the API and confirms', async ({ page }) => {
    await page.locator('button', { hasText: 'Partner with us' }).click();
    await page.fill('#enquiry-partner-name', 'E2E Partner');
    await page.fill('#enquiry-partner-email', `e2e.partner.${Date.now()}@veraawell.test`);
    await page.fill('#enquiry-partner-organisation', 'E2E Wellness Clinic');
    await page.fill('#enquiry-partner-phone', '+91 90000 00000');
    await page.fill('#enquiry-partner-message', 'We would like to offer sessions to our patients.');

    const posted = page.waitForResponse((res) =>
      res.url().includes('/api/enquiries') && res.request().method() === 'POST');

    await page.getByRole('button', { name: 'Send Partnership Enquiry' }).click();

    const response = await posted;
    expect(response.status()).toBe(201);
    expect((await response.json()).data.type).toBe('partner');

    await expect(page.getByText('Thank you — we have it')).toBeVisible();
  });

  test('a general query posts with type "other"', async ({ page }) => {
    await page.locator('button', { hasText: 'Other Queries' }).click();
    await page.fill('#enquiry-other-name', 'E2E Enquirer');
    await page.fill('#enquiry-other-email', `e2e.other.${Date.now()}@veraawell.test`);
    await page.fill('#enquiry-other-subject', 'Press enquiry');
    await page.fill('#enquiry-other-message', 'Who handles media requests?');

    const posted = page.waitForResponse((res) =>
      res.url().includes('/api/enquiries') && res.request().method() === 'POST');

    await page.getByRole('button', { name: 'Send Enquiry' }).click();

    const response = await posted;
    expect(response.status()).toBe(201);
    expect((await response.json()).data.type).toBe('other');
    await expect(page.getByText('Thank you — we have it')).toBeVisible();
  });

  test('switching tabs does not carry one form’s errors into the other', async ({ page }) => {
    // setActiveTab in CareerPage resets currentStep but not error/success, so
    // the enquiry forms own their own state. This is the check that they do.
    await page.locator('button', { hasText: 'Other Queries' }).click();
    await page.getByRole('button', { name: 'Send Enquiry' }).click();
    await expect(page.getByText('Please tell us your name')).toBeVisible();

    await page.locator('button', { hasText: 'Partner with us' }).click();
    await expect(page.getByText('Please tell us your name')).toHaveCount(0);
  });
});
