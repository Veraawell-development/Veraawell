import { defineConfig, devices } from '@playwright/test';

/**
 * Veraawell E2E configuration.
 *
 * Both servers are started by Playwright now. The API comes up via
 * server/scripts/e2e-stack.js, which boots the real Express app against a
 * throwaway in-memory MongoDB behind a loopback assertion — so a test run can
 * never reach the live Atlas cluster named in server/.env — and seeds a
 * deterministic fixture set directly through Mongoose.
 *
 * That last part matters: POST /api/auth/register creates a PendingUser and
 * emails a hashed OTP rather than a User, so the old `npm run seed:e2e` path
 * (register, then log in) could never produce a login-able account.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: [
    {
      command: 'node scripts/e2e-stack.js',
      cwd: '../server',
      url: 'http://localhost:5001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],

  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    {
      name: 'public-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*public.*\.spec\.ts/,
    },
    {
      name: 'auth-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*auth.*\.spec\.ts/,
    },
    {
      name: 'patient-tests',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/patient.json' },
      dependencies: ['setup'],
      testMatch: /.*patient.*\.spec\.ts/,
    },
    {
      name: 'doctor-tests',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/doctor.json' },
      dependencies: ['setup'],
      testMatch: /.*doctor.*\.spec\.ts/,
    },
    {
      name: 'admin-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*admin.*\.spec\.ts/,
    },
  ],
});
