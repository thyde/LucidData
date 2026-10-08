'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { acceptLegalDocumentsAction } from '@/lib/actions/legal.actions';
import { unwrap } from '@/lib/actions/unwrap';
import { LEGAL_DOCUMENTS, type IndividualDocument } from '@/lib/constants/legal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { SignOutButton } from '@/components/auth/sign-out-button';

interface LegalAcceptanceGateProps {
  outstanding: IndividualDocument[];
  /** True when the person accepted an earlier version, so this is a change. */
  returning: boolean;
}

function formatDate(version: string): string {
  return new Date(`${version}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * LD-110. Shown in place of the dashboard until the current terms and privacy
 * policy are accepted, so a material change reaches everyone before they carry
 * on. It replaces the page rather than covering it, so nothing on the page,
 * such as the welcome tour, can open over it.
 */
export function LegalAcceptanceGate({ outstanding, returning }: LegalAcceptanceGateProps) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titles = outstanding.map((document) => LEGAL_DOCUMENTS[document].title).join(' and the ');

  const accept = async () => {
    setSaving(true);
    setError(null);
    try {
      await unwrap(acceptLegalDocumentsAction({ documents: outstanding }));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your acceptance could not be saved. Try again.');
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">
            {returning ? 'We updated our terms' : 'Review our terms'}
          </CardTitle>
          <CardDescription>
            {returning
              ? 'These documents changed since you last agreed to them. Review and accept them to keep using LucidData.'
              : 'Review and accept these to keep using LucidData.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            {outstanding.map((document) => (
              <li key={document}>
                <Link
                  href={LEGAL_DOCUMENTS[document].path}
                  target="_blank"
                  className="text-primary underline"
                >
                  {LEGAL_DOCUMENTS[document].title}
                </Link>{' '}
                <span className="text-muted-foreground">
                  (in effect from {formatDate(LEGAL_DOCUMENTS[document].version)})
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-start gap-2 text-sm">
            <input
              id="accept-updated-terms"
              type="checkbox"
              name="acceptUpdatedTerms"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-1"
            />
            <label htmlFor="accept-updated-terms">I agree to the {titles}.</label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            If you do not want to accept, you can still export your data or delete your account in{' '}
            <Link href="/settings" className="text-primary underline">
              Settings
            </Link>
            , or make a request on the{' '}
            <Link href="/privacy" className="text-primary underline">
              Privacy
            </Link>{' '}
            page.
          </p>
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-2">
          <SignOutButton className="text-sm text-muted-foreground underline" />
          <Button type="button" onClick={accept} disabled={!agreed || saving}>
            {saving ? 'Saving...' : 'Continue'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
