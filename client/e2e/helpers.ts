/**
 * E2E Test Helpers & Page Object Models
 * Centralises selectors and common actions to keep specs clean
 */
import { Page, expect } from '@playwright/test';

export const BASE_URL = 'http://localhost:5173';
export const API_URL  = 'http://localhost:5001/api';

// ─── Test Credentials (must exist in DB or be seeded) ───────────────────────
export const TEST_PATIENT = {
  email:    'e2e.patient@veerawell.test',
  password: 'TestPatient123!',
  username: 'e2e.patient@veerawell.test',
};

export const TEST_DOCTOR = {
  email:    'e2e.doctor@veerawell.test',
  password: 'TestDoctor123!',
  username: 'e2e.doctor@veerawell.test',
};

// ─── Page Object Models ──────────────────────────────────────────────────────

export class AuthPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async loginAsPatient(email = TEST_PATIENT.email, password = TEST_PATIENT.password) {
    await this.goto();
    // Select Patient role (default but be explicit)
    await this.page.click('button:has-text("Patient")');
    await this.page.fill('input[placeholder*="email"]', email);
    await this.page.fill('input[placeholder*="password"]', password);
    await this.page.click('button:has-text("Sign In as Patient")');
    await this.page.waitForURL('**/patient-dashboard', { timeout: 15000 });
  }

  async loginAsDoctor(email = TEST_DOCTOR.email, password = TEST_DOCTOR.password) {
    await this.goto();
    // Select Doctor role
    await this.page.click('button:has-text("Doctor")');
    await this.page.fill('input[placeholder*="email"]', email);
    await this.page.fill('input[placeholder*="password"]', password);
    await this.page.click('button:has-text("Sign In as Doctor")');
    await this.page.waitForURL('**/doctor-dashboard', { timeout: 15000 });
  }

  async logout() {
    // Click hamburger / profile menu to find logout
    try {
      await this.page.click('[aria-label="Menu"], button:has-text("Logout"), [data-testid="logout"]', { timeout: 5000 });
    } catch {
      // The sidebar toggle varies by page — try clicking the first sidebar button
      await this.page.locator('button').filter({ hasText: /menu|hamburger/i }).first().click();
    }
    await this.page.click('button:has-text("Logout"), button:has-text("Sign Out")', { timeout: 5000 });
    await this.page.waitForURL('**/', { timeout: 10000 });
  }
}

export class PatientDashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/patient-dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  async openSidebar() {
    await this.page.click('button[aria-label="Open sidebar"], button:has-text("☰")');
  }

  get sessionCalendar() { return this.page.locator('[data-testid="patient-calendar"], .calendar-container, .fc-view-harness').first(); }
  get bookSessionButton() { return this.page.locator('button:has-text("Book"), button:has-text("Find Therapist")').first(); }
  get chatBadge()        { return this.page.locator('[data-testid="unread-badge"], .bg-red-500.rounded-full').first(); }
}

export class DoctorDashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/doctor-dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  get onlineToggle() { return this.page.locator('button:has-text("Online"), button:has-text("Offline"), button:has-text("Go Online"), button:has-text("Go Offline")').first(); }
  get chatButton()   { return this.page.locator('button:has-text("Messages"), svg + *:has-text("chat")').first(); }
}

// ─── Wait helpers ────────────────────────────────────────────────────────────

/** Wait for a toast notification with given text */
export async function waitForToast(page: Page, text: string | RegExp, timeout = 8000) {
  await expect(page.locator(`text=${text}`).or(page.getByRole('alert').filter({ hasText: text }))).toBeVisible({ timeout });
}

/** Wait for API response and assert it's ok */
export async function waitForApiSuccess(page: Page, urlPattern: string | RegExp) {
  return page.waitForResponse(
    resp => (typeof urlPattern === 'string' ? resp.url().includes(urlPattern) : urlPattern.test(resp.url())) && resp.ok(),
    { timeout: 15000 }
  );
}
