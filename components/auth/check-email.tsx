'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAuthErrorMessage } from '@/lib/utils/network-errors';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/** Supabase refuses a second confirmation email within this window anyway. */
export const RESEND_COOLDOWN_MS = 60_000;

interface ResendConfirmationProps {
  email: string;
  getCaptchaToken: () => Promise<string | undefined>;
}

/** Sends the sign-up confirmation email again, at most once a minute. */
export function useResendConfirmation({ email, getCaptchaToken }: ResendConfirmationProps) {
  const [sending, setSending] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'sent' | 'error'; text: string } | null>(null);

  const resend = async () => {
    setSending(true);
    setNotice(null);
    try {
      const { error } = await createClient().auth.resend({
        type: 'signup',
        email,
        options: { captchaToken: await getCaptchaToken() },
      });
      if (error) {
        setNotice({ kind: 'error', text: getAuthErrorMessage(error) });
        return;
      }
      setNotice({ kind: 'sent', text: 'Sent. Check your inbox, and your spam folder if it is not there.' });
      setCoolingDown(true);
      setTimeout(() => setCoolingDown(false), RESEND_COOLDOWN_MS);
    } catch (error) {
      setNotice({ kind: 'error', text: getAuthErrorMessage(error) });
    } finally {
      setSending(false);
    }
  };

  return { resend, sending, coolingDown, notice };
}

interface CheckEmailProps extends ResendConfirmationProps {
  turnstileRef: (node: HTMLDivElement | null) => (() => void) | undefined;
}

/**
 * LD-610. After sign-up, when the address still needs confirming. Nothing is set
 * up yet: the vault is created the first time the person signs in, because
 * that is when their password is next in hand.
 */
export function CheckEmail({ email, getCaptchaToken, turnstileRef }: CheckEmailProps) {
  const { resend, sending, coolingDown, notice } = useResendConfirmation({ email, getCaptchaToken });

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle as="h1" className="text-2xl font-bold text-center">Check your email</CardTitle>
        <CardDescription className="text-center">
          We sent a link to <span className="font-medium text-foreground">{email}</span>. Open it
          to confirm your address, then sign in. Your vault is set up the first time you sign in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">
          The link works once and expires after an hour.
        </p>
        {notice && (
          <p
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={
              notice.kind === 'error'
                ? 'bg-destructive/15 text-destructive text-sm p-3 rounded-md'
                : 'bg-muted text-sm p-3 rounded-md'
            }
          >
            {notice.text}
          </p>
        )}
        <div ref={turnstileRef} />
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={sending || coolingDown}
          onClick={resend}
        >
          {sending ? 'Sending...' : 'Send the link again'}
        </Button>
        <p className="text-sm text-center text-muted-foreground">
          Confirmed already?{' '}
          <Link href="/login" className="text-primary underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
