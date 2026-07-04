import { defineConfig, devices } from '@playwright/test';

/**
 * Veerawell E2E Test Configuration
 * Tests run against the local dev server (http://localhost:5173)
 * Backend must be running at http://localhost:5001
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential - tests share state (logged-in cookies)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // All API calls go to the real local backend
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
  },

  projects: [
    // Setup project: Runs once to create authenticated states
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    // Patient tests: reuse patient auth session
    {
      name: 'patient-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/patient.json',
      },
      dependencies: ['setup'],
      testMatch: /.*patient.*\.spec\.ts/,
    },

    // Doctor tests: reuse doctor auth session
    {
      name: 'doctor-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/doctor.json',
      },
      dependencies: ['setup'],
      testMatch: /.*doctor.*\.spec\.ts/,
    },

    // Public tests: no auth required
    {
      name: 'public-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*public.*\.spec\.ts/,
    },

    // Auth tests: specific login/signup flows
    {
      name: 'auth-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*auth.*\.spec\.ts/,
    },
  ],
});
