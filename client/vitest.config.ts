import { defineConfig } from 'vitest/config';

/**
 * Component and unit tests for the client.
 *
 * Separate from Playwright: these run in-process with no server and no browser,
 * so they can import the server's own modules directly and assert that the two
 * implementations of the refund and scoring rules agree.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // e2e/ belongs to Playwright.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
