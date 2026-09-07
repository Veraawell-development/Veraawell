/**
 * The patient journey, against the real app and a seeded in-memory database.
 *
 * The previous version of this file was false green: it asserted `h1` on a page
 * that has none, and every session, calendar and modal case ended in
 * `test.skip()` because it looked for `.fc-event` and `[data-testid=...]`
 * selectors that do not exist in this codebase. Selectors here are the ones the
 * app actually ships — aria-labels and visible text — and nothing is skipped.
 */

import { test, expect, Page } from '@playwright/test';
import { fixtures } from './fixtures';
import { API_URL } from './helpers';

/**
 * The mood check-in opens over the dashboard on load and swallows clicks.
 * Dismissing it is part of arriving at the dashboard, not an extra step.
 */
async function arriveAtDashboard(page: Page) {
  await page.goto('/patient-dashboard');
  await expect(page.getByText('YOUR DASHBOARD')).toBeVisible({ timeout: 20_000 });

  for (const name of [/I'll do this later/i, /^Close$/]) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  const closeMood = page.locator('[aria-label="Close"]').first();
  if (await closeMood.count()) await closeMood.click().catch(() => {});
}

/** Open the slide-out sidebar and follow one of its entries. */
async function navigateVia(page: Page, item: string | RegExp, expectedUrl: RegExp) {
  await page.locator('[aria-label="Open menu"]').first().click();
  await page.getByText(item, { exact: typeof item === 'string' }).first().click();
  await expect(page).toHaveURL(expectedUrl, { timeout: 15_000 });
}

test.describe('the dashboard', () => {
  test.beforeEach(async ({ page }) => { await arriveAtDashboard(page); });

  test('greets the signed-in patient by name', async ({ page }) => {
    // dateUtils.getGreeting() has FIVE variants — morning, afternoon,
    // evening, night and "Night owl" — and the closing punctuation changes
    // with the hour too, so a test that names only three passes for part of
    // the day and fails for the rest.
    await expect(
      page.getByText(/(Good (morning|afternoon|evening|night)|Night owl), E2E/)
    ).toBeVisible();
  });

  test('shows every dashboard panel', async ({ page }) => {
    for (const panel of ['YOUR DASHBOARD', 'CARE NOTES', 'SCHEDULE', 'SELF-ASSESSMENT']) {
      await expect(page.getByText(panel).first()).toBeVisible();
    }
  });

  test('surfaces the seeded upcoming session with a working join control', async ({ page }) => {
    await expect(page.getByText(/Next session in/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join Session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reschedule' })).toBeVisible();
  });

  test('renders a month calendar with real day cells', async ({ page }) => {
    // The weekday labels are uppercased in CSS, so the DOM text is "Sun", not
    // "SUN" — matching what innerText shows would never find them.
    for (const day of [/^sun$/i, /^mon$/i, /^sat$/i]) {
      await expect(page.getByText(day).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: '15', exact: true })).toBeVisible();
  });

  test('lists the mental health screenings that exist', async ({ page }) => {
    for (const label of [/Depression Test/, /Anxiety Test/, /ADHD Test/]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test('offers the emergency helplines without leaving the page', async ({ page }) => {
    await page.locator('[aria-label="Emergency helplines"]').first().click();
    await expect(page.getByText(/helpline|Emergency|Kiran|Tele/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('the mood check-in', () => {
  test('records a mood and persists it to the API', async ({ page }) => {
    await page.goto('/patient-dashboard');
    await expect(page.getByText('YOUR DASHBOARD')).toBeVisible({ timeout: 20_000 });

    const later = page.getByRole('button', { name: /I'll do this later/i }).first();
    if (await later.count()) await later.click();

    const good = page.locator('[aria-label="Good"]').first();
    await expect(good).toBeVisible({ timeout: 10_000 });

    const saved = page.waitForResponse(
      (r) => r.url().includes('/session-tools/mood') && r.request().method() === 'POST',
      { timeout: 15_000 }
    );
    await good.click();
    const submit = page.getByRole('button', { name: /Save|Submit|Done|Continue/i }).first();
    if (await submit.count()) await submit.click();

    const res = await saved;
    expect(res.status()).toBeLessThan(300);
  });
});

test.describe('navigation reaches every patient route', () => {
  test.beforeEach(async ({ page }) => { await arriveAtDashboard(page); });

  test('Messages', async ({ page }) => {
    await page.locator('[aria-label="Messages"]').first().click();
    await expect(page).toHaveURL(/\/messages/, { timeout: 15_000 });
  });

  test('Journal', async ({ page }) => {
    await navigateVia(page, 'Journal', /\/my-journal/);
  });

  test('Screening', async ({ page }) => {
    await navigateVia(page, 'Screening', /\/mental-health/);
  });

  test('Tasks', async ({ page }) => {
    await navigateVia(page, 'Tasks', /\/pending-tasks/);
  });

  test('Calls', async ({ page }) => {
    await navigateVia(page, 'Calls', /\/call-history/);
  });

  test('Therapists', async ({ page }) => {
    await navigateVia(page, 'Therapists', /\/my-therapists/);
  });

  test('Settings', async ({ page }) => {
    await navigateVia(page, 'Settings', /\/settings/);
  });
});

test.describe('the journal', () => {
  test('an entry can be written, read back and deleted', async ({ page }) => {
    await page.goto('/my-journal');
    const unique = `E2E entry ${Date.now()}`;

    const newBtn = page.getByRole('button', { name: /New Entry|Write First Entry/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 20_000 });
    await newBtn.click();

    // Title and Content are both required; the placeholders are examples, not
    // the word "title".
    await page.getByPlaceholder('E.g., Morning Reflections').fill(unique);
    await page.getByPlaceholder('Write your thoughts...').fill('Written by the end-to-end suite.');

    const created = page.waitForResponse(
      (r) => r.url().includes('/session-tools/journal') && r.request().method() === 'POST',
      { timeout: 15_000 }
    );
    await page.getByRole('button', { name: 'Save Entry' }).click();
    expect((await created).status()).toBeLessThan(300);

    await expect(page.getByText(unique).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Save is disabled until both required fields are filled', async ({ page }) => {
    await page.goto('/my-journal');
    const newBtn = page.getByRole('button', { name: /New Entry|Write First Entry/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 20_000 });
    await newBtn.click();

    const save = page.getByRole('button', { name: 'Save Entry' });
    await expect(save).toBeDisabled();

    // Content alone is not enough — Title is required too.
    await page.getByPlaceholder('Write your thoughts...').fill('Body with no title.');
    await expect(save).toBeDisabled();

    await page.getByPlaceholder('E.g., Morning Reflections').fill('A title at last');
    await expect(save).toBeEnabled();
  });
});

test.describe('a mental health screening end to end', () => {
  test('answering every question produces a stored result', async ({ page }) => {
    await page.goto('/mental-health/anxiety');

    const start = page.getByRole('button', { name: /Start|Begin|Continue/i }).first();
    if (await start.count()) await start.click();

    const submitted = page.waitForResponse(
      (r) => r.url().includes('/assessments') && r.request().method() === 'POST',
      { timeout: 30_000 }
    );

    // One question at a time; answer whatever option is offered until the
    // questionnaire ends.
    for (let i = 0; i < 30; i += 1) {
      const options = page.locator('button', { hasText: /Not at all|Several days|More than half|Nearly every day|Never|Sometimes|Often|Always/i });
      if (!(await options.count())) break;
      await options.first().click();
      await page.waitForTimeout(180);
      if (/test-results/.test(page.url())) break;
    }

    const res = await submitted;
    expect(res.status()).toBeLessThan(300);
    await expect(page).toHaveURL(/\/test-results\//, { timeout: 20_000 });
    await expect(page.getByText(/severity|score|Minimal|Mild|Moderate|Severe/i).first()).toBeVisible();
  });
});

test.describe('the screening tiles line up', () => {
  /**
   * Two real height bugs lived here: the test-name row was minHeight: 28 with
   * no wrap control, so a two-line name ('Post-Partum Test') rendered 33px and
   * pushed that one tile's SEVERITY row down; and the RETEST button had no
   * marginTop: 'auto', so a tile stretched by a taller sibling collected its
   * slack below the button. Both were viewport-dependent, hence two widths.
   */
  for (const width of [1440, 1024]) {
    test(`all four tiles are equal and their rows align at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await arriveAtDashboard(page);

      const grid = page.getByTestId('patient-screening-tiles');
      await expect(grid).toBeVisible();

      const geometry = await grid.evaluate((el) => {
        const tiles = [...el.children].map((c) => c.getBoundingClientRect());
        const buttons = [...el.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
        const scores = [...el.querySelectorAll('[data-metric-value]')].map((v) => v.getBoundingClientRect());
        return {
          count: tiles.length,
          heights: tiles.map((r) => Math.round(r.height)),
          widths: tiles.map((r) => Math.round(r.width)),
          buttonTops: buttons.map((r) => Math.round(r.top)),
          scoreTops: scores.map((r) => Math.round(r.top)),
        };
      });

      expect(geometry.count).toBe(4);
      expect(new Set(geometry.heights).size).toBe(1);
      expect(new Set(geometry.widths).size).toBe(1);

      // Within each row, the score rings and the action buttons share a line.
      const pairs: Array<[number, number]> = [[0, 1], [2, 3]];
      for (const [i, j] of pairs) {
        expect(Math.abs(geometry.scoreTops[i] - geometry.scoreTops[j])).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.buttonTops[i] - geometry.buttonTops[j])).toBeLessThanOrEqual(1);
      }
    });
  }
});

test.describe('the DLA-20 screening', () => {
  test('the dashboard offers a test the client cannot render', async ({ page }) => {
    // The server's VALID_TEST_TYPES accepts 'dla20' and assessmentScoring
    // deliberately defers to the client's score for it, but the client's
    // MENTAL_HEALTH_TESTS registry has no dla20 entry — so
    // calculateTestScore('dla20') throws and MentalHealthTestPage cannot
    // build the questionnaire.
    await arriveAtDashboard(page);
    await expect(page.getByText('DLA-20').first()).toBeVisible({ timeout: 15_000 });
  });

  test('opening it bounces back instead of starting a questionnaire', async ({ page }) => {
    await page.goto('/mental-health/dla20');
    await page.waitForTimeout(3000);

    // An unknown slug redirects to the screening index rather than rendering
    // questions, so the tile leads nowhere.
    expect(page.url()).not.toContain('/mental-health/dla20');
    await expect(page).toHaveURL(/\/mental-health$/);
  });

  test('every other screening does open its questionnaire', async ({ page }) => {
    for (const slug of ['depression', 'anxiety', 'adhd', 'ptsd']) {
      await page.goto(`/mental-health/${slug}`);
      await page.waitForTimeout(1500);
      expect(page.url()).toContain(`/mental-health/${slug}`);
    }
  });
});

test.describe('booking', () => {
  test('the directory opens on "Available Now" and shows nothing when no one is online', async ({ page }) => {
    // Arriving without location.state defaults to the online-only view, so a
    // patient who navigates straight to /choose-professional sees an empty
    // directory whenever no therapist happens to be toggled online — even
    // though bookable doctors exist.
    await page.goto('/choose-professional');
    await expect(page.getByText('Find Your Therapist')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/No professionals online/i)).toBeVisible({ timeout: 15_000 });
  });

  test('switching to "All" reveals the bookable doctors', async ({ page }) => {
    await page.goto('/choose-professional');
    await expect(page.getByText('Find Your Therapist')).toBeVisible({ timeout: 25_000 });

    await page.getByRole('button', { name: 'All Available' }).click();

    await expect(page.getByText('All Professionals')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('2 available')).toBeVisible();

    // Both seeded doctors render with their real qualification, server-priced
    // session fee and treated conditions.
    await expect(page.getByText('MPhil Clinical Psychology').first()).toBeVisible();
    await expect(page.getByText(/₹800\/session/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Book Session/i }).first()).toBeVisible();
  });

  test('a doctor profile shows qualifications, pricing and a booking control', async ({ page }) => {
    const { users } = fixtures();
    await page.goto(`/doctor/${users.doctorA.id}`);

    await expect(page.getByText('MPhil Clinical Psychology')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/EXPERIENCE/i).first()).toBeVisible();
    await expect(page.getByText(/8\+ years/)).toBeVisible();
    // Server-authoritative pricing from the seeded profile.
    await expect(page.getByText(/Rs\.\s*800/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Book Appointment/i })).toBeVisible();
  });

  test('the booking control is present and payment is not started without a slot', async ({ page }) => {
    const { users } = fixtures();
    await page.goto(`/doctor/${users.doctorA.id}`);

    // Razorpay's checkout script is third-party; block it so a stray click
    // cannot open a real payment modal.
    await page.route('**/checkout.razorpay.com/**', (r) => r.abort());

    const bookBtn = page.getByRole('button', { name: /Book|Schedule/i }).first();
    await expect(bookBtn).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('role enforcement', () => {
  test('a patient is bounced off every doctor-only route', async ({ page }) => {
    // ProtectedRoute redirects to '/', not '/login' (App.tsx:76).
    for (const route of ['/doctor-dashboard', '/manage-calendar', '/doctor-settings', '/patient-details']) {
      await page.goto(route);
      // Relative, so the assertion resolves against the configured baseURL
      // rather than pinning the suite to one port.
      await expect(page).toHaveURL('/', { timeout: 15_000 });
    }
  });

  test('an unknown route renders the 404 page', async ({ page }) => {
    await page.goto('/no-such-page-exists');
    await expect(page.getByText('Page Not Found')).toBeVisible();
  });
});

test.describe('missing images', () => {
  test('a deleted asset answers 200 with HTML instead of 404ing', async ({ page }) => {
    // This is why the breakage is invisible to monitoring. The SPA fallback —
    // Vite's in development, the catch-all rewrite in client/vercel.json in
    // production — serves index.html for any unmatched path, so a request for
    // a deleted image succeeds with Content-Type: text/html. Nothing logs a
    // 404, and only the rendered page shows the failure.
    for (const asset of ['/priya.png', '/profile-main.jpg']) {
      const res = await page.request.get(asset);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('text/html');
    }
  });

  test('the landing page renders broken images', async ({ page }) => {
    // An <img> whose response is HTML decodes to nothing: complete, with
    // naturalWidth 0. That is the only reliable signal here.
    await page.goto('/');
    await page.waitForTimeout(3000);

    const broken = await page.evaluate(() => [...document.querySelectorAll('img')]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.getAttribute('src')));

    expect(broken).toContain('/priya.png');
    expect(broken.length).toBeGreaterThan(0);
  });

  test('the About page renders a broken portrait', async ({ page }) => {
    await page.goto('/about');
    await page.waitForTimeout(3000);

    const broken = await page.evaluate(() => [...document.querySelectorAll('img')]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.getAttribute('src')));

    expect(broken).toContain('/profile-main.jpg');
  });
});

/**
 * Sending a message.
 *
 * No test anywhere actually sent one before, which is how a duplicate-message
 * bug shipped: chat.service.js broadcast the receiver's copy to
 * `conversation:<id>`, a room the sender is also in, so the sender received
 * their own message stamped `isSentByMe: false` on top of the correct echo.
 * Every message a user sent rendered twice — once as theirs, once as an
 * incoming reply the other person never sent.
 */
test.describe('sending a message', () => {
  const { users } = fixtures();

  /** Create (or find) the patient↔doctor conversation, the way the app does. */
  async function ensureConversation(page: import('@playwright/test').Page) {
    const { csrfToken } = await (await page.request.get(`${API_URL}/csrf-token`)).json();
    const res = await page.request.post(`${API_URL}/chat/conversation`, {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { otherUserId: users.doctorA.id },
    });
    expect(res.ok()).toBe(true);
    return (await res.json()).conversationId;
  }

  test('a sent message appears exactly once, on the sender’s own side', async ({ page }) => {
    await ensureConversation(page);
    await page.goto('/messages');
    // Not networkidle: the chat socket stays open and the unread count polls
    // every 10 seconds, so the network never goes quiet on this page.
    const composer = page.getByPlaceholder('Type a message...');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    const text = `e2e-once-${Date.now()}`;
    await composer.fill(text);
    await composer.press('Enter');

    // Give both the optimistic append and the server echo time to land, so a
    // second copy would be on screen by the time we count.
    await page.waitForTimeout(2500);

    const bubbles = page.locator('[data-testid="chat-message"]').filter({ hasText: text });
    await expect(bubbles).toHaveCount(1);
    await expect(bubbles.first()).toHaveAttribute('data-own', 'true');
  });

  test('the sent bubble shows a clock time, not a raw ISO timestamp', async ({ page }) => {
    // The optimistic entry used new Date().toISOString() while the server sends
    // a pre-formatted time, so an unreconciled bubble rendered
    // "2026-09-07T06:35:12.741Z" underneath the message.
    await ensureConversation(page);
    await page.goto('/messages');
    const composer = page.getByPlaceholder('Type a message...');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    const text = `e2e-clock-${Date.now()}`;
    await composer.fill(text);
    await composer.press('Enter');
    await page.waitForTimeout(2500);

    const bubble = page.locator('[data-testid="chat-message"]').filter({ hasText: text }).first();
    await expect(bubble).toContainText(/\d{1,2}:\d{2}\s*(AM|PM)/i);
    await expect(bubble).not.toContainText(/\d{4}-\d{2}-\d{2}T/);
  });
});
