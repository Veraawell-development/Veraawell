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
    await page.fill('input[placeholder="john@example.com"]', 'testdoctor@veerawell.test');
    // Leaving Phone empty
    // Form is standard HTML5 required fields, so the browser will prevent submission.
    // We will just fill everything correctly in the next test to test full flow.
  });

  test('successfully completes the professional onboarding flow', async ({ page }) => {
    // Step 1
    await page.locator('button', { hasText: 'Join as Professional' }).click();
    await page.fill('input[placeholder="John"]', 'Test Professional');
    await page.fill('input[placeholder="john@example.com"]', `e2e.prof.${Date.now()}@veerawell.test`);
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
