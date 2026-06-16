'use client';

import Link from 'next/link';
import { useEncryption } from '@/lib/context/encryption-context';
import { VaultList } from '@/components/vault/vault-list';
import { Button } from '@/components/ui/button';

export default function VaultPage() {
  const { isLocked } = useEncryption();

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <h2 className="text-2xl font-semibold">Your vault is locked</h2>
        <p className="text-muted-foreground max-w-sm">
          Sign in again to derive your encryption key and unlock your vault entries.
        </p>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return <VaultList />;
}
