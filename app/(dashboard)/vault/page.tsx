'use client';

import Link from 'next/link';
import { useEncryption } from '@/lib/context/encryption-context';
import { VaultList } from '@/components/vault/vault-list';
import { RecoverySetupGate } from '@/components/vault/recovery-setup-gate';
import { Button } from '@/components/ui/button';

export default function VaultPage() {
  const { isLocked } = useEncryption();

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        {/* LD-108: the locked state is still the vault page, so it keeps the
            page heading rather than starting the outline at level two. */}
        <h1 className="text-2xl font-semibold">Your vault is locked</h1>
        <p className="text-muted-foreground max-w-sm">
          Sign in again to derive your encryption key and unlock your vault entries.
        </p>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <RecoverySetupGate>
      <VaultList />
    </RecoverySetupGate>
  );
}
