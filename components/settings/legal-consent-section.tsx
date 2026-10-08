'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { grantHealthDataConsentAction, withdrawHealthDataConsentAction } from '@/lib/actions/legal.actions';
import { unwrap } from '@/lib/actions/unwrap';
import { INDIVIDUAL_DOCUMENTS, LEGAL_DOCUMENTS } from '@/lib/constants/legal';
import type { LegalStatus } from '@/lib/services/legal.service';
import { useToast } from '@/lib/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface LegalConsentSectionProps {
  status: LegalStatus | null;
  /** Set when a connector sent the person here because consent was missing. */
  consentRequired: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** LD-110: the documents a person accepted, and their health data consent. */
export function LegalConsentSection({ status, consentRequired }: LegalConsentSectionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const consent = status?.healthConsent;

  const grant = async () => {
    setSaving(true);
    try {
      await unwrap(grantHealthDataConsentAction({ source: 'settings' }));
      toast({ title: 'Consent saved', description: 'LucidData can now store health and fitness data you add.' });
      router.refresh();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Consent not saved', description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    setSaving(true);
    try {
      const { disconnected } = await unwrap(withdrawHealthDataConsentAction());
      toast({
        title: 'Consent withdrawn',
        description:
          disconnected > 0
            ? `LucidData will not store new health data. ${disconnected} connected ${disconnected === 1 ? 'source was' : 'sources were'} disconnected.`
            : 'LucidData will not store new health data.',
      });
      router.refresh();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Consent not withdrawn', description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="health-data-consent" className="space-y-4 scroll-mt-24">
      <h2 className="text-lg font-medium">Legal and consent</h2>

      {consentRequired && !consent?.granted && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Connecting a source brings in health data, so LucidData needs your consent first. Give it
          below, then connect the source again.
        </p>
      )}

      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">Health data</h3>
        {consent?.granted ? (
          <p className="text-sm text-muted-foreground">
            You consented on {consent.recordedAt ? formatDate(consent.recordedAt) : 'an earlier date'}.
            LucidData stores health and fitness data you add, import, or bring in from a connected
            source, encrypted in your browser.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {consent?.recordedAt
              ? `You withdrew consent on ${formatDate(consent.recordedAt)}. `
              : 'You have not consented to LucidData storing health and fitness data. '}
            Until you do, health entries, health imports, and connected sources stay off.
          </p>
        )}
        <p className="text-sm">
          <Link href={LEGAL_DOCUMENTS['health-privacy'].path} className="text-primary underline">
            Consumer Health Data Privacy Policy
          </Link>
        </p>
        {consent?.granted ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={saving}>
                Withdraw consent
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Withdraw consent to store health data?</AlertDialogTitle>
                <AlertDialogDescription>
                  LucidData will stop storing new or changed health data, and your connected
                  sources will be disconnected. Health entries already in your vault stay until
                  you delete them, and you can still view and export them.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep consent</AlertDialogCancel>
                <AlertDialogAction onClick={withdraw}>Withdraw consent</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button size="sm" onClick={grant} disabled={saving}>
            {saving ? 'Saving...' : 'Give consent'}
          </Button>
        )}
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <h3 className="font-medium">Documents you accepted</h3>
        <ul className="space-y-1 text-sm">
          {INDIVIDUAL_DOCUMENTS.map((document) => {
            const accepted = status?.accepted[document];
            return (
              <li key={document}>
                <Link href={LEGAL_DOCUMENTS[document].path} className="text-primary underline">
                  {LEGAL_DOCUMENTS[document].title}
                </Link>
                <span className="text-muted-foreground">
                  {accepted
                    ? `: accepted ${formatDate(accepted.recordedAt)}, version ${accepted.version}`
                    : ': not accepted yet'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
