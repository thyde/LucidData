/**
 * E2E tests - LD-610 email confirmation.
 *
 * Local Supabase auto-confirms sign-ups, so these tests make unconfirmed
 * accounts with the admin API's generateLink, which leaves the address
 * unconfirmed and returns the same hashed token the confirmation email carries.
 */

import { test, expect, type Page } from '@playwright/test';
import { clearSession, getUniqueEmail, TEST_USER } from '../helpers/auth';
import { createAdminClient } from '../helpers/supabase-admin';

async function unconfirmedAccount(email: string, password: string) {
  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: 'signup',
    email,
    password,
  });
  if (error) throw error;
  return { userId: data.user.id, tokenHash: data.properties.hashed_token };
}

async function typeInto(page: Page, selector: string, value: string): Promise<void> {
  const input = page.locator(selector);
  await input.click();
  await input.pressSequentially(value, { delay: 30 });
  await expect(input).toHaveValue(value);
}

async function submitSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.waitForSelector('input[name="email"]', { state: 'visible' });
  await typeInto(page, 'input[name="email"]', email);
  await typeInto(page, 'input[name="password"]', password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function hasSessionCookie(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  // Sign-up stores a PKCE code verifier under a similar name. It is not a session.
  return cookies.some(
    (cookie) => cookie.name.includes('auth-token') && !cookie.name.endsWith('code-verifier')
  );
}

/** Next.js adds its own route announcer with role="alert", so match by text too. */
function alertWith(page: Page, text: string) {
  return page.getByRole('alert').filter({ hasText: text });
}

function statusWith(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text });
}

test.describe('Email confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('confirming signs nobody in, and the first sign-in sets up the vault', async ({ page }) => {
    const email = getUniqueEmail('confirm');
    const { userId, tokenHash } = await unconfirmedAccount(email, TEST_USER.password);

    await page.goto(`/confirm-email?token_hash=${tokenHash}&type=email`);
    await expect(page.getByRole('heading', { name: 'Confirm your email address' })).toBeVisible();
    // Opening the link alone must not use it up; a mail scanner does that much.
    await page.reload();
    await page.getByRole('button', { name: 'Confirm email address' }).click();

    await page.waitForURL('**/login?confirmed=1');
    await expect(statusWith(page, 'Your email address is confirmed')).toBeVisible();
    expect(await hasSessionCookie(page)).toBe(false);

    await submitSignIn(page, email, TEST_USER.password);

    const dialog = page.getByRole('dialog', { name: 'Save your recovery code' });
    await expect(dialog).toBeVisible({ timeout: 60000 });
    await dialog.getByRole('link', { name: 'Continue to dashboard' }).click();
    await page.waitForURL('**/dashboard', { timeout: 60000 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('users').select('key_salt').eq('id', userId).single();
    expect(profile?.key_salt).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    const { data: audit } = await admin
      .from('audit_logs')
      .select('event_type')
      .eq('user_id', userId)
      .eq('event_type', 'vault_initialized');
    expect(audit).toHaveLength(1);
  });

  test('a link that was already used is refused and explained', async ({ page }) => {
    const email = getUniqueEmail('confirm-used');
    const { tokenHash } = await unconfirmedAccount(email, TEST_USER.password);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.goto(`/confirm-email?token_hash=${tokenHash}&type=email`);
      await page.getByRole('button', { name: 'Confirm email address' }).click();
      await page.waitForURL(/\/login\?confirmed=/);
    }

    expect(page.url()).toContain('confirmed=invalid');
    await expect(alertWith(page, 'expired or was already used')).toBeVisible();
  });

  test('a link missing its token says so instead of offering a button', async ({ page }) => {
    await page.goto('/confirm-email');
    await expect(page.getByText('missing part of its address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm email address' })).toHaveCount(0);
  });

  test('signing in before confirming offers a new link', async ({ page }) => {
    const email = getUniqueEmail('unconfirmed');
    await unconfirmedAccount(email, TEST_USER.password);

    await page.goto('/login');
    await submitSignIn(page, email, TEST_USER.password);

    await expect(alertWith(page, 'Confirm your email address before you sign in')).toBeVisible();
    await page.getByRole('button', { name: 'Send a new confirmation link' }).click();
    await expect(statusWith(page, 'Sent.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send a new confirmation link' })).toBeDisabled();
  });

  test('sign-up waits for confirmation when the server requires it', async ({ page }) => {
    const email = getUniqueEmail('awaiting');
    // Production requires confirmation and local Supabase does not, so answer
    // the sign-up the way production does: a user and no session.
    await page.route('**/auth/v1/signup**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-4000-8000-00000000e2e0',
          aud: 'authenticated',
          role: 'authenticated',
          email,
          created_at: new Date().toISOString(),
          identities: [],
          user_metadata: {},
          app_metadata: {},
        }),
      })
    );
    await page.route('**/auth/v1/resend**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );

    await page.goto('/signup');
    await typeInto(page, 'input[name="email"]', email);
    await typeInto(page, 'input[name="password"]', TEST_USER.password);
    await typeInto(page, 'input[name="confirmPassword"]', TEST_USER.password);
    await page.locator('input[name="acceptTerms"]').check();
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    expect(await hasSessionCookie(page)).toBe(false);

    await page.getByRole('button', { name: 'Send the link again' }).click();
    await expect(statusWith(page, 'Sent.')).toBeVisible();
  });
});
