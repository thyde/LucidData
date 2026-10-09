'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthErrorMessage } from '@/lib/utils/network-errors';
import { useEncryption } from '@/lib/context/encryption-context';
import { useTurnstile } from '@/lib/hooks/use-turnstile';
import { safeRedirectPath } from '@/lib/utils/safe-redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PasskeyLoginButton } from '@/components/auth/passkey-login-button';
import { VaultUnlockDialog } from '@/components/auth/vault-unlock-dialog';
import { MfaChallenge } from '@/components/auth/mfa-challenge';
import { RecoveryCodeDialog } from '@/components/auth/recovery-code-dialog';
import { useResendConfirmation } from '@/components/auth/check-email';
import { setUpVault } from '@/lib/account/account-crypto';

/** What the confirm-email page reports back, shown above the form. */
const CONFIRMATION_NOTICES: Record<string, { kind: 'status' | 'alert'; text: string }> = {
  '1': {
    kind: 'status',
    text: 'Your email address is confirmed. Sign in to set up your vault.',
  },
  invalid: {
    kind: 'alert',
    text: 'That confirmation link has expired or was already used. If you have not confirmed yet, sign in and you can ask for a new link.',
  },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { unlock } = useEncryption();
  const { attach: turnstileRef, getToken: getCaptchaToken } = useTurnstile('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passkeyKeySalt, setPasskeyKeySalt] = useState<string | null>(null);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const redirectTo = safeRedirectPath(searchParams.get('redirectedFrom'));
  const confirmation = CONFIRMATION_NOTICES[searchParams.get('confirmed') ?? ''];
  const {
    resend,
    sending: resending,
    coolingDown,
    notice: resendNotice,
  } = useResendConfirmation({ email: unconfirmedEmail ?? '', getCaptchaToken });
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    general?: string;
  }>({});

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors: typeof errors = {};

    if (!email.trim()) {
      validationErrors.email = 'Email is required';
    }

    if (!password.trim()) {
      validationErrors.password = 'Password is required';
    }

    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setErrors({});
    setUnconfirmedEmail(null);

    const supabase = createClient();

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: await getCaptchaToken() },
      });

      if (error) {
        setErrors({ general: getAuthErrorMessage(error) });
        if (error.code === 'email_not_confirmed') setUnconfirmedEmail(email);
        return;
      }

      // Derive the master key from the password while it is in hand.
      let newRecoveryCode: string | null = null;
      try {
        const profileRes = await fetch('/api/user/profile');
        if (profileRes.ok) {
          const { data: profile } = await profileRes.json() as { data: { key_salt: string | null } };
          if (profile?.key_salt) {
            await unlock(password, profile.key_salt);
          } else {
            // LD-610: the first sign-in after confirming the email address is
            // where the vault gets its salt and recovery code.
            const setup = await setUpVault(password);
            await unlock(password, setup.keySalt);
            newRecoveryCode = setup.recoveryCode;
          }
        }
      } catch {
        // Non-fatal: user can still navigate, but vault will be locked
      }

      // If the account has 2FA enrolled, require the challenge before continuing.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
        setMfaRequired(true);
        return;
      }

      if (newRecoveryCode) {
        setRecoveryCode(newRecoveryCode);
        return; // Hold on the recovery-code dialog until the person acknowledges it.
      }

      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      // Catch network errors (connection refused, timeout, etc.)
      setErrors({ general: getAuthErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  if (mfaRequired) {
    return (
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle as="h1" className="text-2xl font-bold text-center">Two-factor authentication</CardTitle>
          <CardDescription className="text-center">
            Enter the 6-digit code from your authenticator app
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaChallenge
            onVerified={() => {
              router.push(redirectTo);
              router.refresh();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle as="h1" className="text-2xl font-bold text-center">Welcome back</CardTitle>
        <CardDescription className="text-center">
          Enter your credentials to access your vault
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleLogin} noValidate>
        <CardContent className="space-y-4">
          {confirmation && !errors.general && (
            <p
              role={confirmation.kind}
              className={
                confirmation.kind === 'alert'
                  ? 'bg-destructive/15 text-destructive text-sm p-3 rounded-md'
                  : 'bg-muted text-sm p-3 rounded-md'
              }
            >
              {confirmation.text}
            </p>
          )}
          {errors.general && (
            <div role="alert" className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
              {errors.general}
            </div>
          )}
          {unconfirmedEmail && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={resending || coolingDown}
                onClick={resend}
              >
                {resending ? 'Sending...' : 'Send a new confirmation link'}
              </Button>
              {resendNotice && (
                <p
                  role={resendNotice.kind === 'error' ? 'alert' : 'status'}
                  className="text-sm text-muted-foreground text-center"
                >
                  {resendNotice.text}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && (
              <p role="alert" className="text-sm text-destructive">
                {errors.email}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-sm text-primary underline">
                Forgot password?
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Toggle password visibility"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
            {errors.password && (
              <p role="alert" className="text-sm text-destructive">
                {errors.password}
              </p>
            )}
          </div>
          <div ref={turnstileRef} />
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
          <PasskeyLoginButton
            email={email}
            redirectTo={redirectTo}
            onNeedEncryptionPassword={(keySalt) => {
              setPasskeyKeySalt(keySalt);
              setShowUnlockDialog(true);
            }}
          />
          <p className="text-sm text-center text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
      {passkeyKeySalt && (
        <VaultUnlockDialog
          open={showUnlockDialog}
          keySalt={passkeyKeySalt}
          redirectTo={redirectTo}
          onClose={() => setShowUnlockDialog(false)}
        />
      )}
      <RecoveryCodeDialog code={recoveryCode} continueHref={redirectTo} />
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle as="h1" className="text-2xl font-bold text-center">Welcome back</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your vault
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
