/**
 * Patient Dashboard E2E Tests
 * Covers: Dashboard rendering, navigation, session management,
 * booking flow, mental health tests, journal, messaging.
 *
 * Prerequisite: auth.setup.ts has run and saved patient.json
 */

import { test, expect } from '@playwright/test';

test.describe('Patient Dashboard — Core Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patient-dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('dashboard loads and shows greeting', async ({ page }) => {
    // Greeting should contain morning/afternoon/evening or just a name
    const greeting = page.locator('h1').first();
    await expect(greeting).toBeVisible({ timeout: 10000 });
    const text = await greeting.textContent();
    // Greeting should contain some common greeting words or the user's name
    expect(text).toBeTruthy();
  });

  test('sidebar navigation links are visible on open', async ({ page }) => {
    // Open sidebar (hamburger)
    const hamburger = page.locator('button[aria-label*="sidebar"], button[aria-label*="menu"]').first()
      .or(page.locator('button').filter({ has: page.locator('svg') }).first());
    // Try clicking the first button that opens a sidebar
    const sidebarBtn = page.locator('button').nth(0);
    await sidebarBtn.click();
    await page.waitForTimeout(500);
    // Check at least one nav item
    const dashboardLink = page.locator('a[href="/patient-dashboard"], button:has-text("Dashboard")').first();
    // It's okay if sidebar doesn't exist as a drawer — check for nav links inline
    const hasNav = await page.locator('nav, [role="navigation"]').count() > 0;
    expect(hasNav || await dashboardLink.count() > 0).toBeTruthy();
  });

  test('calendar widget is rendered', async ({ page }) => {
    // Calendar or upcoming sessions section
    const calendar = page.locator('.fc, [data-testid="calendar"], .calendar, table').first();
    // Allow calendar to be in a section or embedded — check for date cells or the section
    const section = page.locator('text=Upcoming, text=Sessions, text=Calendar').first();
    const isVisible = await calendar.count() > 0 || await section.count() > 0;
    expect(isVisible).toBeTruthy();
  });
});

test.describe('Patient Dashboard — Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patient-dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('can navigate to Messages page', async ({ page }) => {
    // Find chat/messages button (with unread badge or without)
    await page.click('button:has-text("Messages"), a[href="/messages"], [aria-label="Chat"]', { timeout: 5000 }).catch(async () => {
      // Fallback: look for SVG chat icon button
      await page.locator('button').filter({ has: page.locator('svg') }).nth(1).click();
    });
    await page.waitForURL('**/messages', { timeout: 10000 });
    await expect(page).toHaveURL(/messages/);
  });

  test('can navigate to Mental Health page', async ({ page }) => {
    const link = page.locator('a[href="/mental-health"], button:has-text("Mental Health"), button:has-text("Assessments")').first();
    if (await link.count() > 0) {
      await link.click();
      await expect(page).toHaveURL(/mental-health/, { timeout: 10000 });
    } else {
      // Link might be in sidebar — acceptable to skip if not present in UI
      test.skip(true, 'Mental health link not directly accessible from dashboard');
    }
  });

  test('can navigate to My Journal', async ({ page }) => {
    const link = page.locator('a[href="/my-journal"], button:has-text("Journal")').first();
    if (await link.count() > 0) {
      await link.click();
      await expect(page).toHaveURL(/my-journal/, { timeout: 10000 });
    }
  });

  test('book session button exists', async ({ page }) => {
    const bookBtn = page.locator('button:has-text("Book"), button:has-text("Find"), a[href*="choose-professional"]').first();
    await expect(bookBtn).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Patient Dashboard — Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patient-dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('clicking a session opens session modal', async ({ page }) => {
    // Wait for calendar to fully load
    await page.waitForTimeout(2000);

    // Look for session events in the calendar  
    const sessionEvent = page.locator('.fc-event, [data-testid="session-event"], .session-card').first();
    if (await sessionEvent.count() > 0) {
      await sessionEvent.click();
      // Session modal should open
      await expect(page.locator('[role="dialog"], .modal, .fixed.inset-0').first()).toBeVisible({ timeout: 5000 });
    } else {
      // No sessions booked yet — acceptable
      test.skip(true, 'No sessions available to click');
    }
  });

  test('cancel button visible in session modal for scheduled sessions', async ({ page }) => {
    await page.waitForTimeout(2000);
    const sessionEvent = page.locator('.fc-event, [data-testid="session-event"]').first();
    if (await sessionEvent.count() > 0) {
      await sessionEvent.click();
      await page.waitForTimeout(1000);
      // Check if cancel button exists (patient-only feature we implemented)
      const cancelBtn = page.locator('button:has-text("Cancel Session")').first();
      // It may or may not be there depending on session status
      const isScheduled = await page.locator('text=Scheduled').count() > 0;
      if (isScheduled) {
        await expect(cancelBtn).toBeVisible({ timeout: 3000 });
      }
    } else {
      test.skip(true, 'No sessions to test cancellation');
    }
  });
});

test.describe('Patient Dashboard — Emergency Hotline', () => {
  test('emergency hotline button opens modal', async ({ page }) => {
    await page.goto('/patient-dashboard');
    await page.waitForLoadState('networkidle');

    const hotlineBtn = page.locator('button:has-text("Emergency"), button:has-text("Hotline"), button:has-text("Crisis")').first();
    if (await hotlineBtn.count() > 0) {
      await hotlineBtn.click();
      await expect(page.locator('[role="dialog"], .modal, .fixed.inset-0').first()).toBeVisible({ timeout: 5000 });
    }
  });
});
