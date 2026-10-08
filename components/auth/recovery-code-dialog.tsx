'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RecoveryCodeDisplay } from '@/components/settings/recovery-code-display';

interface RecoveryCodeDialogProps {
  code: string | null;
  continueHref: string;
}

/**
 * Shown once, right after a vault is set up. It cannot be dismissed by clicking
 * outside, because closing it by accident would lose the only copy of the code.
 */
export function RecoveryCodeDialog({ code, continueHref }: RecoveryCodeDialogProps) {
  return (
    <Dialog open={!!code} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Save your recovery code</DialogTitle>
          <DialogDescription>
            This is the only way to recover your vault if you forget your password. Store it
            somewhere safe. It is shown once.
          </DialogDescription>
        </DialogHeader>
        {code && <RecoveryCodeDisplay code={code} />}
        <Button asChild className="w-full">
          <Link href={continueHref}>Continue to dashboard</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
