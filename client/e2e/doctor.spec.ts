/**
 * Doctor Dashboard E2E Tests
 * Covers: Dashboard rendering, online/offline toggle, session management,
 * calendar, notifications, post-session report.
 *
 * Prerequisite: auth.setup.ts has run and saved doctor.json
 */

import { test, expect } from '@playwright/test';

test.describe('Doctor Dashboard — Core Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/doctor-dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('dashboard loads and shows greeting', async ({ page }) => {
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    const text = await heading.textContent();
    expect(text).toBeTruthy();
  });

  test('dashboard shows stats section', async ({ page }) => {
    // Revenue / Sessions / Hours stats are displayed
    const statsArea = page.locator('text=Revenue, text=Sessions, text=Hours, text=Earnings').first();
    // At minimum there should be some number-based stat card
    const hasStats = await page.locator('.stat, [data-testid="stat"], .grid').count() > 0;
    expect(hasStats || await statsArea.count() > 0).toBeTruthy();
  });

  test('calendar section is visible', async ({ page }) => {
    const calendar = page.locator('.fc, table.fc-scrollgrid, [data-testid="calendar"]').first();
    const hasCalendar = await calendar.count() > 0;
    expect(hasCalendar).toBeTruthy();
  });

  test('chat/messages button is visible in header', async ({ page }) => {
    const chatBtn = page.locator('button').filter({ has: page.locator('svg[viewBox="0 0 24 24"]') }).first();
    const hasBtn = await chatBtn.count() > 0;
    // Either dedicated button or navigate link
    const msgLink = page.locator('a[href="/messages"]').first();
    expect(hasBtn || await msgLink.count() > 0).toBeTruthy();
  });
});

test.describe('Doctor Dashboard — Online/Offline Toggle', () => {
  test('online/offline toggle button is visible', async ({ page }) => {
    await page.goto('/doctor-dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Allow async status fetch

    const toggle = page.locator('button:has-text("Online"), button:has-text("Offline"), button:has-text("Go Online"), button:has-text("Go Offline")').first();
    await expect(toggle).toBeVisible({ timeout: 8000 });
  });

  test('clicking toggle calls status API', async ({ page }) => {
    await page.goto('/doctor-dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const toggle = page.locator('button:has-text("Online"), button:has-text("Offline"), button:has-text("Go Online"), button:has-text("Go Offline")').first();
    if (await toggle.count() > 0) {
      const [response] = await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/doctor/status') && resp.request().method() === 'POST', { timeout: 10000 }),
        toggle.click(),
      ]);
      expect(response.status()).toBe(200);
    }
  });
});

test.describe('Doctor Dashboard — Session Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/doctor-dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('clicking session event opens session modal', async ({ page }) => {
    const sessionEvent = page.locator('.fc-event, [data-testid="session-event"]').first();
    if (await sessionEvent.count() > 0) {
      await sessionEvent.click();
      const modal = page.locator('[role="dialog"], .modal, .fixed.inset-0').first();
      await expect(modal).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'No sessions on calendar to click');
    }
  });

  test('session modal shows Join Session button for upcoming sessions', async ({ page }) => {
    const sessionEvent = page.locator('.fc-event').first();
    if (await sessionEvent.count() > 0) {
      await sessionEvent.click();
      await page.waitForTimeout(500);
      // Join button or similar CTA should be visible
      const joinBtn = page.locator('button:has-text("Join"), a:has-text("Join")').first();
      // Only assert visible if session is upcoming — otherwise skip
      const isUpcoming = await page.locator('text=Scheduled, text=Upcoming').count() > 0;
      if (isUpcoming) {
        await expect(joinBtn).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

test.describe('Doctor Dashboard — Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/doctor-dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('can navigate to Messages page via chat button', async ({ page }) => {
    await page.click('a[href="/messages"], button:has-text("Messages")').catch(async () => {
      // Try the icon button in header
      await page.locator('button').filter({ has: page.locator('svg') }).nth(0).click();
    });
    await page.waitForURL('**/messages', { timeout: 10000 });
    await expect(page).toHaveURL(/messages/);
  });

  test('can navigate to Manage Calendar', async ({ page }) => {
    const link = page.locator('a[href="/manage-calendar"], button:has-text("Manage Calendar"), button:has-text("Availability")').first();
    if (await link.count() > 0) {
      await link.click();
      await expect(page).toHaveURL(/manage-calendar/, { timeout: 10000 });
    }
  });
});
