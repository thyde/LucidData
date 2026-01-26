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
  reporter: [['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
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
    command: 'npx dotenv-cli -e .env.test -- npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
