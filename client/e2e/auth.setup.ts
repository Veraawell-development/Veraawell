/**
 * Creates the signed-in storage states the patient and doctor projects reuse.
 *
 * This replaces the previous setup, which could never have worked: it relied on
 * `npm run seed:e2e` calling POST /api/auth/register and then logging in, but
 * registration creates a PendingUser carrying a bcrypt-hashed OTP rather than a
 * User, so the login always returned 403 requiresVerification. (The script it
 * shelled out to, server/scripts/approve-e2e-doctor.js, also required a module
 * that does not exist.) Accounts now come from the stack's Mongoose-level seed.
 *
 * Selectors are exact-name role queries because `button:has-text("Patient")`
 * matches both the role pill and the "Sign In as Patient" submit button.
 */

import { test as setup, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fixtures } from './fixtures';

const AUTH_DIR = path.join(process.cwd(), 'e2e/.auth');

async function signIn(page: Page, role: 'Patient' | 'Doctor', email: string, password: string) {
  await page.goto('/login');

  // The navbar renders skeleton placeholders until AuthContext resolves.
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).first().fill(password);
  await page.getByRole('button', { name: `Sign In as ${role}` }).click();
}

setup('sign in as a patient', async ({ page }) => {
  const { users } = fixtures();
  await signIn(page, 'Patient', users.patientA.email, users.patientA.password);

  await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: path.join(AUTH_DIR, 'patient.json') });
});

setup('sign in as a doctor', async ({ page }) => {
  const { users } = fixtures();
  await signIn(page, 'Doctor', users.doctorA.email, users.doctorA.password);

  await page.waitForURL('**/doctor-dashboard', { timeout: 20_000 });
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: path.join(AUTH_DIR, 'doctor.json') });
});
