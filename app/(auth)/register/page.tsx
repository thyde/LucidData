'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthErrorMessage } from '@/lib/utils/network-errors';
import { useEncryption } from '@/lib/context/encryption-context';
import { useTurnstile } from '@/lib/hooks/use-turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckEmail } from '@/components/auth/check-email';
import { RecoveryCodeDialog } from '@/components/auth/recovery-code-dialog';
import { setUpVault } from '@/lib/account/account-crypto';
import { signupSourceFrom } from '@/lib/utils/signup-source';

/** The account exists and is signed in; only the vault setup is missing. */
const SETUP_UNFINISHED_MESSAGE =
  'Your account is created, but setting up your vault did not finish. Sign in to finish it.';

export default function RegisterPage() {
  const router = useRouter();
  const { unlock } = useEncryption();
  const { attach: turnstileRef, getToken: getCaptchaToken } = useTurnstile('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors: typeof errors = {};

    if (!email.trim()) {
      validationErrors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      validationErrors.email = 'Enter a valid email';
    }

    if (!password.trim()) {
      validationErrors.password = 'Password is required';
    } else if (password.length < 8) {
      validationErrors.password = 'Password must be at least 8 characters';
    }

    if (!confirmPassword.trim()) {
      validationErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      validationErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    const supabase = createClient();

    try {
      // Only a page we link from can set this, and only to a value on the list.
      const signupSource = signupSourceFrom(
        new URLSearchParams(window.location.search).get('from')
      );
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          captchaToken: await getCaptchaToken(),
          ...(signupSource ? { data: { signup_source: signupSource } } : {}),
        },
      });

      if (error) {
        setErrors({ general: getAuthErrorMessage(error) });
        return;
      }

      // With email confirmation on, there is no session until the address is
      // confirmed. The vault is set up at the first sign-in after that, which
      // is when the password is next in hand.
      if (!data.session) {
        setAwaitingConfirmation(email);
        return;
      }

      // Confirmation is off here (local development and previews), so the vault
      // is set up now, in the browser, from the password just entered.
      let setup;
      try {
        setup = await setUpVault(password);
      } catch {
        setErrors({ general: SETUP_UNFINISHED_MESSAGE });
        return;
      }

      try {
        await unlock(password, setup.keySalt);
      } catch {
        // The vault stays locked, and signing in again unlocks it.
      }

      if (setup.recoveryCode) {
        setRecoveryCode(setup.recoveryCode);
        return; // Hold on the recovery-code dialog until the person acknowledges it.
      }

      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      // Catch network errors (connection refused, timeout, etc.)
      setErrors({ general: getAuthErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  if (awaitingConfirmation) {
    return (
      <CheckEmail
        email={awaitingConfirmation}
        getCaptchaToken={getCaptchaToken}
        turnstileRef={turnstileRef}
      />
    );
  }

  return (
    <>
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle as="h1" className="text-2xl font-bold text-center">Create an account</CardTitle>
        <CardDescription className="text-center">
          Start securing your personal data today
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleRegister} noValidate>
        <CardContent className="space-y-4">
          {errors.general && (
            <div role="alert" className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
              {errors.general}
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && (
              <p role="alert" className="text-sm text-destructive">
                {errors.password}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {errors.confirmPassword && (
              <p role="alert" className="text-sm text-destructive">
                {errors.confirmPassword}
              </p>
            )}
          </div>
          <div ref={turnstileRef} />
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign up'}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
    <RecoveryCodeDialog code={recoveryCode} continueHref="/dashboard" />
    </>
  );
}
