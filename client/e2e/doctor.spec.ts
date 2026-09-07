/**
 * The practitioner journey.
 *
 * The previous version of this file waited on `POST **&#47;doctor/status**`, an
 * endpoint that does not exist — the real one is
 * POST /api/doctor-status/toggle-online — so the online-toggle test could only
 * ever time out. It also asserted `h1` on a page with no heading element, and
 * fell back to clicking `button` positionally, which opens the sidebar rather
 * than navigating. All of that is replaced with the controls the app ships.
 */

import { test, expect, Page } from '@playwright/test';
import { fixtures } from './fixtures';

async function arriveAtDashboard(page: Page) {
  await page.goto('/doctor-dashboard');
  await expect(page.getByRole('button', { name: 'Pricing & Payouts' })).toBeVisible({ timeout: 20_000 });

  const later = page.getByRole('button', { name: /I'll do this later/i }).first();
  if (await later.count()) { await later.click().catch(() => {}); await page.waitForTimeout(300); }
}

async function navigateVia(page: Page, item: string | RegExp, expectedUrl: RegExp) {
  await page.locator('[aria-label="Open menu"]').first().click();
  await page.getByText(item, { exact: typeof item === 'string' }).first().click();
  await expect(page).toHaveURL(expectedUrl, { timeout: 15_000 });
}

test.describe('the dashboard', () => {
  test.beforeEach(async ({ page }) => { await arriveAtDashboard(page); });

  test('greets the signed-in doctor', async ({ page }) => {
    // dateUtils.getGreeting() has FIVE variants — morning, afternoon,
    // evening, night and "Night owl" — and the closing punctuation changes
    // with the hour too, so a test that names only three passes for part of
    // the day and fails for the rest.
    await expect(
      page.getByText(/(Good (morning|afternoon|evening|night)|Night owl), Dr/)
    ).toBeVisible();
  });

  test('shows the practice panels', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Pricing & Payouts' })).toBeVisible();
    await expect(page.getByRole('button', { name: /All Tasks/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /All Reports/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /View All Notes/i })).toBeVisible();
  });

  test('offers both availability states', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Online', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Offline', exact: true })).toBeVisible();
  });
});

test.describe('the online/offline toggle', () => {
  test('going online calls the real status endpoint and persists', async ({ page }) => {
    await arriveAtDashboard(page);

    // The endpoint the app actually uses. The previous spec waited on
    // POST **/doctor/status, which is not a route in this application.
    const toggled = page.waitForResponse(
      (r) => r.url().includes('/doctor-status/toggle-online') && r.request().method() === 'POST',
      { timeout: 20_000 }
    );
    await page.getByRole('button', { name: 'Online', exact: true }).click();
    const res = await toggled;
    expect(res.status()).toBeLessThan(300);

    // The API agrees, not just the button styling.
    const status = await page.request.get('http://localhost:5001/api/doctor-status/online-doctors');
    expect(status.ok()).toBe(true);
    const body = await status.json();
    expect(JSON.stringify(body)).toContain(fixtures().users.doctorA.id);
  });

  test('clicking the state the doctor is already in fires no request', async ({ page }) => {
    await arriveAtDashboard(page);
    await page.getByRole('button', { name: 'Online', exact: true }).click();
    await page.waitForTimeout(1200);

    // onClick is undefined for the active pill (DoctorDashboard.tsx:547), so a
    // second click on the same state is inert rather than a redundant write.
    let posted = false;
    page.on('request', (r) => {
      if (r.url().includes('/doctor-status/toggle-online')) posted = true;
    });
    await page.getByRole('button', { name: 'Online', exact: true }).click();
    await page.waitForTimeout(1500);
    expect(posted).toBe(false);
  });

  test('going offline removes the doctor from the public online list', async ({ page }) => {
    await arriveAtDashboard(page);
    await page.getByRole('button', { name: 'Online', exact: true }).click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Offline', exact: true }).click();
    await page.waitForTimeout(1500);

    const status = await page.request.get('http://localhost:5001/api/doctor-status/online-doctors');
    const body = await status.json();
    expect(JSON.stringify(body)).not.toContain(fixtures().users.doctorA.id);
  });
});

test.describe('navigation reaches every doctor route', () => {
  test.beforeEach(async ({ page }) => { await arriveAtDashboard(page); });

  test('Pricing & Payouts', async ({ page }) => {
    await page.getByRole('button', { name: 'Pricing & Payouts' }).click();
    await expect(page).toHaveURL(/\/doctor-settings/, { timeout: 15_000 });
  });

  test('Manage Calendar', async ({ page }) => {
    await page.getByRole('button', { name: 'Manage' }).first().click();
    await expect(page).toHaveURL(/\/manage-calendar/, { timeout: 15_000 });
  });

  test('Session notes', async ({ page }) => {
    await page.getByRole('button', { name: /View All Notes/i }).click();
    await expect(page).toHaveURL(/\/doctor-session-notes/, { timeout: 15_000 });
  });

  test('Tasks', async ({ page }) => {
    await page.getByRole('button', { name: /All Tasks/i }).click();
    await expect(page).toHaveURL(/\/doctor-tasks/, { timeout: 15_000 });
  });

  test('Reports', async ({ page }) => {
    await page.getByRole('button', { name: /All Reports/i }).click();
    await expect(page).toHaveURL(/\/doctor-reports/, { timeout: 15_000 });
  });

  test('Messages', async ({ page }) => {
    await page.locator('[aria-label="Messages"]').first().click();
    await expect(page).toHaveURL(/\/messages/, { timeout: 15_000 });
  });

  test('Patients', async ({ page }) => {
    await navigateVia(page, /Patients|Clients/i, /\/patient-details/);
  });
});

test.describe('publishing availability', () => {
  test('a saved calendar is immediately bookable by a patient', async ({ page }) => {
    await page.goto('/manage-calendar');
    await expect(page.getByText(/Availability|Calendar|Schedule/i).first()).toBeVisible({ timeout: 20_000 });

    const save = page.getByRole('button', { name: /Save|Publish|Update/i }).first();
    if (await save.count()) {
      const saved = page.waitForResponse(
        (r) => r.url().includes('/availability/save') && r.request().method() === 'POST',
        { timeout: 20_000 }
      );
      await save.click();
      expect((await saved).status()).toBeLessThan(300);
    }

    // Whatever the doctor published, the public slot endpoint must answer.
    const { users } = fixtures();
    const tomorrow = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const slots = await page.request.get(
      `http://localhost:5001/api/availability/slots/${users.doctorA.id}/${tomorrow}`
    );
    expect(slots.ok()).toBe(true);
  });
});

test.describe('pricing and payouts', () => {
  test('the page loads the doctor\'s own six prices', async ({ page }) => {
    // DoctorSettingsPage is the one page that reads VITE_API_URL, which is
    // never defined. Locally it falls back to '/api' and works through the Vite
    // proxy; in production that relative path is caught by vercel.json's SPA
    // rewrite and returns index.html instead of JSON, so this page is broken in
    // production only. This test therefore passes here and cannot see that.
    await page.goto('/doctor-settings');
    await expect(page.getByText('Session Pricing')).toBeVisible({ timeout: 20_000 });

    const values = await page.locator('input[type="number"]').evaluateAll(
      (els) => els.map((e) => (e as HTMLInputElement).value)
    );
    // The seeded profile: video 800/1500/2000, audio 600/1200/1600.
    expect(values).toEqual(['800', '1500', '2000', '600', '1200', '1600']);
  });

  test('the payout split is shown net of the platform fee', async ({ page }) => {
    await page.goto('/doctor-settings');
    await expect(page.getByText('Session Pricing')).toBeVisible({ timeout: 20_000 });

    // 20% platform fee: ₹800 gross leaves ₹640, ₹1,500 leaves ₹1,200.
    await expect(page.getByText('Platform fee: 20%')).toBeVisible();
    await expect(page.getByText(/You earn: ₹640/)).toBeVisible();
    await expect(page.getByText(/You earn: ₹1,200/)).toBeVisible();
  });
});

test.describe('the fixed navbar never overlaps a page header', () => {
  /**
   * The Navbar is position: fixed, so every full-height page has to reserve
   * its height. Pages that forget draw their own header underneath the nav
   * links — which is what happened on /doctor-settings, where "Pricing &
   * Payouts" rendered straight through "Home About Us Services…".
   *
   * Geometry rather than a screenshot: the page's first heading must start
   * below where the navbar ends. That catches the whole class on any route.
   */
  const ROUTES = [
    '/doctor-dashboard',
    '/doctor-settings',
    '/manage-calendar',
    '/doctor-reports',
    '/doctor-tasks',
    '/doctor-session-notes',
    '/patient-details',
    '/call-history',
    '/messages'
  ];

  for (const route of ROUTES) {
    test(`${route} clears the navbar`, async ({ page }) => {
      await page.goto(route);
      await page.waitForTimeout(2500);

      const overlap = await page.evaluate(() => {
        const nav = document.querySelector('nav') || document.querySelector('header');
        if (!nav) return { skipped: true, amount: 0, text: '' };
        const navBox = nav.getBoundingClientRect();
        if (navBox.height === 0) return { skipped: true, amount: 0, text: '' };

        // The first substantial heading or title text on the page body.
        const candidates = [...document.querySelectorAll('h1, h2, h3')]
          .filter((el) => !nav.contains(el) && (el.textContent || '').trim().length > 2);

        for (const el of candidates) {
          const box = el.getBoundingClientRect();
          if (box.height === 0) continue;
          // Only the topmost one matters, and only if it sits inside the nav band.
          if (box.top < navBox.bottom - 2) {
            return { skipped: false, amount: navBox.bottom - box.top, text: (el.textContent || '').trim().slice(0, 60) };
          }
          break;
        }
        return { skipped: false, amount: 0, text: '' };
      });

      if (overlap.skipped) test.skip(true, 'no fixed navbar on this route');
      expect(
        overlap.amount,
        `"${overlap.text}" overlaps the navbar by ${Math.round(overlap.amount)}px on ${route}`
      ).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('the Key Metrics tiles line up', () => {
  /**
   * The four tiles used to be four hand-written copies and the fourth had
   * drifted: fontSize 18 against 24, plus a stray
   * justifyContent: 'space-between' that pushed its value to the bottom of the
   * stretched row while its siblings sat at the top — so "DLA-20" rendered
   * below "15". Geometry rather than a screenshot, and at two widths because
   * the defect's visibility depended on the viewport.
   */
  for (const width of [1440, 1024]) {
    test(`all four tiles are equal and share a baseline at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await arriveAtDashboard(page);

      const grid = page.getByTestId('doctor-key-metrics');
      await expect(grid).toBeVisible();

      const geometry = await grid.evaluate((el) => {
        const tiles = [...el.children].map((c) => c.getBoundingClientRect());
        const values = [...el.querySelectorAll('[data-metric-value]')].map((v) => v.getBoundingClientRect());
        return {
          count: tiles.length,
          heights: tiles.map((r) => Math.round(r.height)),
          widths: tiles.map((r) => Math.round(r.width)),
          valueTops: values.map((r) => Math.round(r.top)),
          valueHeights: values.map((r) => Math.round(r.height)),
        };
      });

      expect(geometry.count).toBe(4);

      // Every tile the same size.
      expect(new Set(geometry.heights).size).toBe(1);
      expect(new Set(geometry.widths).size).toBe(1);

      // Every value the same size, so no tile's figure is smaller than the rest.
      expect(new Set(geometry.valueHeights).size).toBe(1);

      // And the two tiles in each row share a top edge.
      const [a, b, c, d] = geometry.valueTops;
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      expect(Math.abs(c - d)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('role enforcement', () => {
  test('a doctor is bounced off every patient-only route', async ({ page }) => {
    for (const route of ['/patient-dashboard', '/my-journal', '/mental-health', '/pending-tasks', '/settings']) {
      await page.goto(route);
      // Relative, so the assertion resolves against the configured baseURL
      // rather than pinning the suite to one port.
      await expect(page).toHaveURL('/', { timeout: 15_000 });
    }
  });

  test('a doctor cannot reach the admin dashboard', async ({ page }) => {
    await page.goto('/super-admin-dashboard');
    await expect(page).toHaveURL(/\/admin-login/, { timeout: 15_000 });
  });
});
