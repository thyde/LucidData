'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthErrorMessage } from '@/lib/utils/network-errors';
import { useEncryption } from '@/lib/context/encryption-context';
import { generateKeySalt } from '@/lib/crypto/key-derivation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RecoveryCodeDisplay } from '@/components/settings/recovery-code-display';
import { setupRecoveryFromPassword } from '@/lib/account/account-crypto';

export default function RegisterPage() {
  const router = useRouter();
  const { unlock } = useEncryption();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
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

    // Generate a unique key salt before registration (browser crypto, no server involvement)
    const keySalt = generateKeySalt();
    const supabase = createClient();

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setErrors({ general: getAuthErrorMessage(error) });
        return;
      }

      if (!data.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setErrors({ general: getAuthErrorMessage(signInError) });
          return;
        }
      }

      // Store the key_salt in the users table
      try {
        await fetch('/api/user/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key_salt: keySalt }),
        });
      } catch {
        // Non-fatal: key_salt can be regenerated, but user must re-register to set it properly
      }

      // Derive master key for this session
      try {
        await unlock(password, keySalt);
      } catch {
        // Non-fatal: vault will be locked but user is still registered
      }

      // Set up a recovery code so a future password reset can restore the vault.
      try {
        const code = await setupRecoveryFromPassword(password, keySalt);
        setRecoveryCode(code);
        return; // Hold on the recovery-code dialog until the user acknowledges it.
      } catch {
        // Non-fatal: the user can generate a recovery code later in settings.
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

  return (
    <>
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
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
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign up'}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
    <Dialog open={!!recoveryCode} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Save your recovery code</DialogTitle>
          <DialogDescription>
            This is the only way to recover your vault if you forget your password. Store it
            somewhere safe. It is shown once.
          </DialogDescription>
        </DialogHeader>
        {recoveryCode && <RecoveryCodeDisplay code={recoveryCode} />}
        <Button
          className="w-full"
          onClick={() => {
            router.push('/dashboard');
            router.refresh();
          }}
        >
          Continue to dashboard
        </Button>
      </DialogContent>
    </Dialog>
    </>
  );
}
