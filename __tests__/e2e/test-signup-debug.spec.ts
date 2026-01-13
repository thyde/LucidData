import { test, expect } from '@playwright/test';

test('debug signup flow', async ({ page }) => {
  // Listen for console logs
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  // Listen for page errors
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Listen for request failures
  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText);
  });

  // Navigate to signup
  await page.goto('/signup');
  console.log('Navigated to signup page');

  // Fill the form
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';

  await page.fill('input[name="email"]', testEmail);
  console.log('Filled email:', testEmail);

  await page.fill('input[name="password"]', testPassword);
  console.log('Filled password');

  await page.fill('input[name="confirmPassword"]', testPassword);
  console.log('Filled confirm password');

  // Submit the form
  console.log('Clicking submit button');
  await page.click('button[type="submit"]');

  // Wait a bit to see what happens
  await page.waitForTimeout(5000);

  // Check current URL
  const currentUrl = page.url();
  console.log('Current URL after submit:', currentUrl);

  // Check for any error messages
  const alerts = await page.locator('[role="alert"]').all();
  if (alerts.length > 0) {
    console.log('Found alerts:', alerts.length);
    for (const alert of alerts) {
      const text = await alert.textContent();
      console.log('Alert text:', text);
    }
  }

  // Take a screenshot
  await page.screenshot({ path: 'debug-signup.png', fullPage: true });
  console.log('Screenshot saved to debug-signup.png');
});
