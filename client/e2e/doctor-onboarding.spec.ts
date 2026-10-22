/**
 * A brand-new therapist, from an empty account to being bookable.
 *
 * WHY THIS SPEC
 *
 * Every other doctor spec signs in as a seeded therapist whose profile is
 * already complete, so nothing walked the path a real new therapist takes.
 * Live on 2026-10-20 that path broke: the profile's Save button (on every
 * tab) skipped the step checks, a profile was stored without a professional
 * type, and the bank form then failed with a bare "Validation failed". This
 * spec takes a fresh account through each step, as a therapist would, and
 * ends with a patient seeing them in the directory.
 */
import { test, expect, Page } from '@playwright/test';
import { fixtures, API_URL } from './fixtures';
import { db, apiSend, superAdminHeaders } from './adminHelpers';
import { createNewDoctor, istDay, removeNewAccounts } from './newAccounts';
import { signIn } from './sessionHelpers';

const EMPTY = { cookies: [], origins: [] };

test.afterAll(async () => { await removeNewAccounts(); });

const profileOf = async (userId: unknown) => (await db()).collection('doctorprofiles').findOne({ userId });

async function save(page: Page) {
  await page.getByRole('button', { name: /Save Changes/ }).click();
}

test.describe('a new therapist sets up their practice', () => {
  test('profile → bank details → approval → open dates → listed for patients', async ({ browser }) => {
    test.setTimeout(120_000);
    const doctor = await createNewDoctor();
    const context = await browser.newContext({ storageState: EMPTY });
    await signIn(context, doctor.email, doctor.password, 'doctor');
    const page = await context.newPage();

    await page.goto('/profile-setup');
    await expect(page.getByText('Basic Information', { exact: true }).first()).toBeVisible();

    // 1. Save with nothing chosen: told what is missing, on the right tab; nothing stored.
    await save(page);
    await expect(page.getByText(/professional type and years of experience/i)).toBeVisible();
    expect(await profileOf(doctor.userId)).toBeNull();

    await page.locator('select').first().selectOption('Psychologist');
    await page.getByPlaceholder('5', { exact: true }).fill('6');

    // 2. Credentials are next in line.
    await save(page);
    await expect(page.getByText(/at least one qualification, language and specialization/i)).toBeVisible();
    expect(await profileOf(doctor.userId)).toBeNull();
    const selects = page.locator('select');
    await selects.nth(0).selectOption('MSc Psychology');
    await selects.nth(1).selectOption('English');
    await selects.nth(2).selectOption('Anxiety');

    // 3. Then all six prices.
    await save(page);
    await expect(page.getByText(/Set a price for every session/i)).toBeVisible();
    expect(await profileOf(doctor.userId)).toBeNull();
    for (const [placeholder, value] of [['500', '600'], ['1000', '1000'], ['1500', '1400'], ['300', '500'], ['600', '900'], ['900', '1200']]) {
      await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
    }

    await save(page);
    await expect(page.getByText('Profile saved successfully!')).toBeVisible();
    await expect(page).toHaveURL(/\/doctor-dashboard/);
    const saved = await profileOf(doctor.userId);
    expect(saved.type).toBe('Psychologist');
    expect(saved.experience).toBe(6);
    expect(saved.specialization).toEqual(['Anxiety']);
    expect(saved.pricing).toMatchObject({ session20: 600, session40: 1000, session55: 1400, audio: { session20: 500, session40: 900, session55: 1200 } });

    // Not listed yet: no approved bank details, no dates — and the dashboard
    // says exactly that (it used to warn only about dates).
    const before = await (await context.request.get(`${API_URL}/sessions/doctors`)).json();
    expect(JSON.stringify(before)).not.toContain(doctor.lastName);
    const card = page.getByTestId('visibility-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText("Patients can't find you yet");
    await expect(card.locator('[data-check="bank"]')).toBeVisible();
    await expect(card.locator('[data-check="dates"]')).toBeVisible();
    await expect(card.locator('[data-check="prices"]')).toHaveCount(0);
    await expect(card.locator('[data-check="profile"]')).toHaveCount(0);
    // Going online is honest about it.
    await page.getByRole('button', { name: 'Online', exact: true }).click();
    await expect(page.getByText(/patients can't ring you yet/i)).toBeVisible();
    await page.getByRole('button', { name: 'Offline', exact: true }).click();

    // 4. Bank details, exactly as typed live (a 9-digit account number).
    await page.goto('/doctor-settings');
    // The prices from setup are already here; the bank form is its own tab
    // (it used to hide behind "Next" on a step-by-step wizard).
    await expect(page.getByRole('spinbutton', { name: '55 Minutes voice price' })).toHaveValue('1200');
    await page.getByRole('tab', { name: 'Bank & payouts' }).click();
    await expect(page).toHaveURL(/#payouts/);
    await page.locator('#accountHolderName').fill('Nova Onboard');
    await page.locator('#accountNumber').fill('123456789');
    // Typed twice; a mismatch is caught before anything is sent.
    await page.locator('#accountNumberConfirm').fill('123456780');
    await page.locator('#ifsc').fill('HDFC0001234');
    await page.locator('#panNumber').fill('ABCDE1234F');
    await page.getByRole('button', { name: /Submit for review/i }).click();
    await expect(page.getByText('The account numbers do not match')).toBeVisible();
    expect((await profileOf(doctor.userId)).payoutBankStatus || 'not_submitted').toBe('not_submitted');
    await page.locator('#accountNumberConfirm').fill('123456789');
    const submitted = page.waitForResponse((r) => r.url().includes('/payouts/bank-details') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Submit for review/i }).click();
    const bankRes = await submitted;
    expect(bankRes.status(), await bankRes.text()).toBe(200);
    await expect(page.getByText(/Validation failed/i)).toHaveCount(0);
    await expect(page.getByText(/An admin will review them/i).first()).toBeVisible();
    expect((await profileOf(doctor.userId)).payoutBankStatus).toBe('pending_admin_approval');

    // 5. A super admin approves; the doctor publishes dates.
    const pending = await (await db()).collection('doctorprofiles')
      .findOne({ userId: doctor.userId }, { projection: { 'payoutBank.submittedAt': 1 } });
    const approve = await apiSend(context.request, 'POST', `/admin/payments/payouts/bank-details/${doctor.userId}/approve`,
      { submittedAt: pending.payoutBank.submittedAt }, superAdminHeaders());
    expect(approve.status(), await approve.text()).toBe(200);
    // Weekly times through the calendar screen, as a therapist sets them.
    await page.goto('/manage-calendar');
    await page.getByRole('button', { name: /Edit Schedule/ }).first().click();
    const inThree = new Date(Date.now() + 3 * 864e5);
    const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(inThree);
    await page.getByRole('button', { name: new RegExp(`^\\w{3} ${dayNum}(:| \\(today\\))`) }).first().click();
    await page.getByRole('button', { name: '10:00 AM', exact: true }).click();
    await page.getByRole('button', { name: '11:00 AM', exact: true }).click();
    await page.getByRole('button', { name: 'Same times Mon–Fri' }).click();
    const calendarSaved = page.waitForResponse((r) => r.url().includes('/availability/save') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /^Save$/ }).click();
    expect((await calendarSaved).status()).toBeLessThan(300);
    const stored = await (await db()).collection('doctoravailabilities').findOne({ doctorId: doctor.userId });
    expect(stored.availabilityType).toBe('weekly');
    expect(stored.weeklySlots.length).toBeGreaterThanOrEqual(5);
    void istDay;

    // Everything done: the dashboard checklist is gone.
    await page.goto('/doctor-dashboard');
    await expect(page.getByText(/Practitioner Dashboard/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('visibility-card')).toHaveCount(0);

    // 6. A patient now finds them in the directory, priced "From ₹500".
    const patient = await browser.newContext({ storageState: EMPTY });
    const { patientB } = fixtures().users;
    await signIn(patient, patientB.email, patientB.password, 'patient');
    const directory = await patient.newPage();
    await directory.goto('/choose-professional');
    const listing = directory.locator('div').filter({ hasText: doctor.lastName }).filter({ hasText: /From\s*₹/ }).last();
    await expect(listing).toBeVisible({ timeout: 15_000 });
    await expect(listing).toContainText(/From\s*₹500/);

    await patient.close();
    await context.close();
  });

  test('a phone-sized screen can finish setup too', async ({ browser }) => {
    test.setTimeout(90_000);
    const doctor = await createNewDoctor();
    const context = await browser.newContext({ storageState: EMPTY, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await signIn(context, doctor.email, doctor.password, 'doctor');
    const page = await context.newPage();
    await page.goto('/profile-setup');

    await page.getByRole('button', { name: 'Basic', exact: true }).click();
    // The form must really be on screen: it used to be squeezed to zero width
    // beside the tabs, and filling hidden fields made this test pass anyway.
    const typeSelect = page.locator('select').first();
    await expect(typeSelect).toBeInViewport();
    const box = await typeSelect.boundingBox();
    expect(box && box.width).toBeGreaterThan(200);
    await typeSelect.selectOption('Counselor');
    await page.getByPlaceholder('5', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Credentials', exact: true }).click();
    const selects = page.locator('select');
    await selects.nth(0).selectOption('MA Psychology');
    await selects.nth(1).selectOption('Hindi');
    await selects.nth(2).selectOption('Stress Management');
    await page.getByRole('button', { name: 'Pricing', exact: true }).click();
    for (const [placeholder, value] of [['500', '400'], ['1000', '700'], ['1500', '900'], ['300', '350'], ['600', '600'], ['900', '800']]) {
      await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
    }
    await save(page);
    await expect(page.getByText('Profile saved successfully!')).toBeVisible();
    expect((await profileOf(doctor.userId)).type).toBe('Counselor');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  });
});
