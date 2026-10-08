'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { grantHealthDataConsentAction } from '@/lib/actions/legal.actions';
import { unwrap } from '@/lib/actions/unwrap';
import { LEGAL_DOCUMENTS } from '@/lib/constants/legal';
import { HealthConsentContext } from '@/lib/hooks/use-health-consent';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * LD-110. Washington's My Health My Data Act requires consent before health
 * data is collected, separate from accepting the terms. The person gives it
 * here, at the moment it matters, or in settings.
 */
export function HealthConsentProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<((granted: boolean) => void) | null>(null);

  const settle = (granted: boolean) => {
    pending.current?.(granted);
    pending.current = null;
    setOpen(false);
    setError(null);
  };

  const requestHealthConsent = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        // A second request while the dialog is open shares the same answer.
        const earlier = pending.current;
        pending.current = (granted) => {
          earlier?.(granted);
          resolve(granted);
        };
        setOpen(true);
      }),
    []
  );

  const consent = async () => {
    setSaving(true);
    setError(null);
    try {
      await unwrap(grantHealthDataConsentAction({ source: 'health-gate' }));
      settle(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your consent could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const value = useMemo(() => ({ requestHealthConsent }), [requestHealthConsent]);

  return (
    <HealthConsentContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && settle(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Consent to store health data</DialogTitle>
            <DialogDescription>
              LucidData needs your consent before it stores health and fitness data, such as
              workouts, sleep, or medical records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Your entries are encrypted in your browser, so we cannot read them. We can see that
              an entry is health data, its type, where it came from, and when it was added.
            </p>
            <p>
              We never sell health data or use it for advertising, and we share it only with an
              organization you grant access to. You can withdraw this consent at any time in
              settings.
            </p>
            <p>
              <Link
                href={LEGAL_DOCUMENTS['health-privacy'].path}
                target="_blank"
                className="text-primary underline"
              >
                Read the Consumer Health Data Privacy Policy
              </Link>
            </p>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => settle(false)} disabled={saving}>
              Not now
            </Button>
            <Button type="button" onClick={consent} disabled={saving}>
              {saving ? 'Saving...' : 'I consent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HealthConsentContext.Provider>
  );
}
