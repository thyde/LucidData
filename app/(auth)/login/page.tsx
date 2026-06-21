'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthErrorMessage } from '@/lib/utils/network-errors';
import { useEncryption } from '@/lib/context/encryption-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PasskeyLoginButton } from '@/components/auth/passkey-login-button';
import { VaultUnlockDialog } from '@/components/auth/vault-unlock-dialog';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { unlock } = useEncryption();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passkeyKeySalt, setPasskeyKeySalt] = useState<string | null>(null);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
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

    const supabase = createClient();

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrors({ general: getAuthErrorMessage(error) });
        return;
      }

      // Derive master key from password immediately after login
      try {
        const profileRes = await fetch('/api/user/profile');
        if (profileRes.ok) {
          const { data: profile } = await profileRes.json() as { data: { key_salt: string | null } };
          if (profile?.key_salt) {
            await unlock(password, profile.key_salt);
          }
        }
      } catch {
        // Non-fatal: user can still navigate, but vault will be locked
      }

      const redirectTo = searchParams.get('redirectedFrom') || '/dashboard';
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      // Catch network errors (connection refused, timeout, etc.)
      setErrors({ general: getAuthErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
        <CardDescription className="text-center">
          Enter your credentials to access your vault
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleLogin} noValidate>
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">
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
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
          <PasskeyLoginButton
            email={email}
            onNeedEncryptionPassword={(keySalt) => {
              setPasskeyKeySalt(keySalt);
              setShowUnlockDialog(true);
            }}
          />
          <p className="text-sm text-center text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
      {passkeyKeySalt && (
        <VaultUnlockDialog
          open={showUnlockDialog}
          keySalt={passkeyKeySalt}
          onClose={() => setShowUnlockDialog(false)}
        />
      )}
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
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
