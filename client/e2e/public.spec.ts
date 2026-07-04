/**
 * Public Pages E2E Tests (no auth required)
 * Covers: Landing, About, Services, FAQ, Contact, Resources,
 *         Choose Professional, Doctor Profile, Articles
 */

import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('loads and has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Veraawell|Veerawell/i);
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
    const faqButton = page.locator('button').filter({ hasText: 'What is Veerawell' }).first();
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
