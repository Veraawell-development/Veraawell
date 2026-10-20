import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { apiSend, closeDb, db, stamp, waitForOtp } from './adminHelpers';

/**
 * Phase 5 — the patient's profile, emergency contact and the way back to the
 * dashboard on a phone. Each test signs up its own patient (verified through
 * the mail sink) so nothing here disturbs the seeded accounts other specs use.
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.afterAll(async () => { await closeDb(); });

const PASSWORD = 'Patient123!';

/** A fresh, verified patient, signed in on this page's context. */
async function newPatient(page: Page, tag: string) {
  const request = page.context().request as unknown as APIRequestContext;
  const email = `p5-${tag}-${stamp()}@example.com`;
  const reg = await apiSend(request, 'POST', '/auth/register', {
    firstName: 'Meera', lastName: '', email, username: email, password: PASSWORD, phoneNo: '9876543210', role: 'patient',
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const verify = await apiSend(request, 'POST', '/auth/verify-signup', { email, otp: await waitForOtp(email) });
  expect(verify.status()).toBe(200);
  return email;
}

async function storedContact(email: string) {
  const user = await (await db()).collection('users').findOne({ email });
  return user?.emergencyContact;
}

test('a new patient lands on an editable profile with Save — not a locked form', async ({ page }) => {
  await newPatient(page, 'edit');
  await page.goto('/patient-profile-setup');
  await expect(page.getByRole('heading', { name: 'Complete your profile' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toBeEnabled();
});

test('"+91 98765 43210" is saved as that number, and the dashboard stops asking without a reload', async ({ page }) => {
  const email = await newPatient(page, 'contact');
  await page.goto('/patient-profile-setup');
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible({ timeout: 20_000 });

  await page.locator('input[type="date"]').fill('1995-04-12');
  await page.locator('select').first().selectOption('Prefer not to say');
  await page.getByPlaceholder('+91 98765 43210').first().fill('9876543210');
  await page.locator('#profile-ec-name').fill('Ravi Rao');
  await page.locator('#profile-ec-phone').fill('+91 98765 43210');
  await page.locator('#profile-ec-relationship').selectOption('Sibling');
  await page.getByRole('button', { name: 'Save profile' }).click();

  await expect(page).toHaveURL(/patient-dashboard/, { timeout: 20_000 });
  await expect.poll(async () => (await storedContact(email))?.phone).toBe('+919876543210');
  // The "add an emergency contact" nudge is gone — the signed-in user was refreshed.
  await expect(page.getByText('Add an emergency contact')).toHaveCount(0);
});

test('a wrong phone is refused on the form with a reason, and nothing is saved', async ({ page }) => {
  const email = await newPatient(page, 'badphone');
  await page.goto('/patient-profile-setup');
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible({ timeout: 20_000 });
  await page.locator('input[type="date"]').fill('1995-04-12');
  await page.locator('select').first().selectOption('Female');
  await page.getByPlaceholder('+91 98765 43210').first().fill('9876543210');
  await page.locator('#profile-ec-name').fill('Ravi Rao');
  await page.locator('#profile-ec-phone').fill('12345');
  await page.locator('#profile-ec-relationship').selectOption('Friend');
  await page.getByRole('button', { name: 'Save profile' }).click();

  await expect(page.getByText(/10 digits, with or without \+91/)).toBeVisible();
  await expect(page).toHaveURL(/patient-profile-setup/);
  expect((await storedContact(email))?.phone ?? null).toBeNull();
});

test('a finished profile can be edited and Cancel puts the old values back', async ({ page }) => {
  await newPatient(page, 'cancel');
  const request = page.context().request as unknown as APIRequestContext;
  const saved = await apiSend(request, 'POST', '/profile/setup', {
    fullName: 'Meera Iyer', phoneNumber: '9876543210', dateOfBirth: '1990-01-01', gender: 'Female',
  });
  expect(saved.status()).toBe(200);

  await page.goto('/patient-profile-setup');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Edit' }).click();
  const name = page.locator('input[type="text"]').first();
  await name.fill('Someone Else');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await expect(name).toHaveValue('Meera Iyer');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the navbar menu offers Dashboard, Profile and Settings to a signed-in patient', async ({ page }) => {
    await newPatient(page, 'mobile');
    await page.goto('/about');
    await page.getByRole('button', { name: 'Open site menu' }).click();
    await page.getByRole('button', { name: 'My Dashboard' }).click();
    await expect(page).toHaveURL(/patient-dashboard/, { timeout: 20_000 });
  });
});
