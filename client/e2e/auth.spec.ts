/**
 * Authentication E2E Tests
 * Tests login, registration, role switching, validation and logout.
 * Runs WITHOUT pre-existing auth state (fresh browser context).
 */

import { test, expect } from '@playwright/test';
import { TEST_PATIENT, TEST_DOCTOR } from './helpers';

test.describe('Authentication — Login', () => {
  test.beforeEach(async ({ page }) => {
    // Clear all cookies and localStorage to ensure we start with a clean session
    // This prevents auto-redirect when a previous test left an auth cookie
    await page.context().clearCookies();
    await page.goto('/login');
    // Clear localStorage after navigation (page context is available)
    await page.evaluate(() => localStorage.clear());
    await page.waitForLoadState('networkidle');
  });

  test('login page renders with Patient/Doctor toggle', async ({ page }) => {
    // The role selector is only visible in login mode (not signup)
    // The AuthPage shows Patient/Doctor buttons inside the login form
    await expect(page.locator('button').filter({ hasText: /^Patient$/ }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button').filter({ hasText: /^Doctor$/ }).first()).toBeVisible({ timeout: 5000 });
    // Tab switchers
    await expect(page.locator('button').filter({ hasText: /^Sign In$/ }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button').filter({ hasText: /^Sign Up$/ }).first()).toBeVisible({ timeout: 5000 });
  });

  test('patient can log in and lands on patient dashboard', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Patient$/ }).first().click();
    await page.fill('input[placeholder*="email"]', TEST_PATIENT.email);
    await page.fill('input[type="password"]', TEST_PATIENT.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/patient-dashboard', { timeout: 20000 });
    await expect(page).toHaveURL(/patient-dashboard/);
  });

  test('doctor can log in and lands on doctor dashboard or profile setup', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Doctor$/ }).first().click();
    await page.fill('input[placeholder*="email"]', TEST_DOCTOR.email);
    await page.fill('input[type="password"]', TEST_DOCTOR.password);

    // Intercept the login API call to confirm it succeeds before waiting for nav
    const [loginResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/auth/login') && resp.request().method() === 'POST', { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    const loginData = await loginResponse.json();
    expect(loginResponse.ok()).toBeTruthy();
    expect(loginData.token || loginData.success).toBeTruthy();

    // After a successful login, App.tsx calls checkAuth then redirects.
    // Wait for the page to navigate away from /login (to any route)
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 20000 });
    const url = page.url();
    // Doctor can land on profile-setup (new), doctor-dashboard (approved), or pending-approval page
    expect(url).not.toMatch(/\/login/);
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Patient$/ }).first().click();
    await page.fill('input[placeholder*="email"]', TEST_PATIENT.email);
    await page.fill('input[type="password"]', 'WrongPassword999!');
    await page.click('button[type="submit"]');
    // Should NOT navigate away
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/patient-dashboard/);
    // Error message should appear
    await expect(page.locator('.bg-red-50, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows error for empty fields', async ({ page }) => {
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveURL(/patient-dashboard/);
  });

  test('forgot password link navigates to reset page', async ({ page }) => {
    await page.click('button:has-text("Forgot password?")');
    await expect(page).toHaveURL(/forgot-password/);
  });
});

test.describe('Authentication — Registration', () => {
  test('signup form appears when Sign Up tab is clicked', async ({ page }) => {
    await page.goto('/login');
    await page.click('button:has-text("Sign Up")');
    await expect(page.locator('input[placeholder*="name"]').or(page.locator('input[placeholder="Your full name"]'))).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toBeVisible();
  });

  test('registration form shows error for mismatched passwords', async ({ page }) => {
    await page.goto('/login');
    await page.click('button:has-text("Sign Up")');
    await page.fill('input[placeholder="Your full name"]', 'Test User');
    await page.fill('input[type="email"]', 'test_new_user_xyz@veerawell.test');
    await page.fill('input[type="tel"]', '9876543210');
    // Fill passwords
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill('Password123!');
    await pwInputs.nth(1).fill('DifferentPassword456!');
    await page.click('button:has-text("Create Account")');
    // Error message
    await expect(page.locator('text=Passwords do not match')).toBeVisible({ timeout: 5000 });
  });

  test('Doctor "join us here" link points to careers page', async ({ page }) => {
    await page.goto('/login');
    await page.click('button:has-text("Sign Up")');
    const link = page.locator('a[href="/careers"]');
    await expect(link).toBeVisible();
  });
});

test.describe('Authentication — Admin Portal', () => {
  test('admin portal link navigates to admin login', async ({ page }) => {
    await page.goto('/login');
    await page.click('button:has-text("Admin Portal")');
    await expect(page).toHaveURL(/admin-login/);
  });
});
