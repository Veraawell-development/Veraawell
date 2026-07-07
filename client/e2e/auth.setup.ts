/**
 * Authentication Setup
 * Runs ONCE before all other tests.
 * Logs in as Patient & Doctor and saves the browser storage state (cookies/localStorage)
 * so subsequent tests can skip the login step entirely.
 *
 * Requirements: The test accounts must already exist in the database.
 * Use the seeder script: `node e2e/seed-test-users.js` to create them.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { TEST_PATIENT, TEST_DOCTOR } from './helpers';

const PATIENT_AUTH_FILE = path.join(process.cwd(), 'e2e/.auth/patient.json');
const DOCTOR_AUTH_FILE  = path.join(process.cwd(), 'e2e/.auth/doctor.json');

setup('Authenticate as Patient', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Ensure Patient role selected (default)
  const patientBtn = page.locator('button:has-text("Patient")');
  if (await patientBtn.count() > 0) {
    await patientBtn.click();
  }

  await page.fill('input[placeholder*="email"]', TEST_PATIENT.email);
  await page.fill('input[type="password"]', TEST_PATIENT.password);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/patient-dashboard', { timeout: 20000 });
  await expect(page).toHaveURL(/patient-dashboard/);

  // Save storage state
  await page.context().storageState({ path: PATIENT_AUTH_FILE });
  console.log('✅ Patient auth state saved');
});

setup('Authenticate as Doctor', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Select Doctor role
  await page.click('button:has-text("Doctor")');
  await page.fill('input[placeholder*="email"]', TEST_DOCTOR.email);
  await page.fill('input[type="password"]', TEST_DOCTOR.password);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/doctor-dashboard', { timeout: 20000 });
  await expect(page).toHaveURL(/doctor-dashboard/);

  // Save storage state
  await page.context().storageState({ path: DOCTOR_AUTH_FILE });
  console.log('✅ Doctor auth state saved');
});
