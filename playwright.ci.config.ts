import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for CI / orchestrator runs.
 * Chromium-only for speed and WSL2 compatibility.
 */
export default defineConfig({
  testDir: './__tests__/e2e',
  globalSetup: './__tests__/e2e/global-setup.ts',
  globalTeardown: './__tests__/e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  // The suite runs against `next dev`, which compiles each route on first
  // request. Signup also runs production-strength key derivation in the browser.
  timeout: 120000,
  expect: {
    // Assertions frequently land on a route the dev server is still compiling.
    timeout: 15000,
  },
  reporter: [['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    // Without this a missing element blocks until the whole test times out,
    // which hides the failing step and its screenshot.
    actionTimeout: 15000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Run against a production build. `next dev` compiles routes on first
    // request, which makes navigation timing unpredictable and does not match
    // what users load.
    command: 'npx dotenv-cli -e .env.test -- npm run e2e:server',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 300000,
  },
});
