'use client';

import { ConsentList } from '@/components/consent/consent-list';

export default function ConsentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Consents</h1>
        <p className="text-muted-foreground mt-1">
          Manage who can access your data
        </p>
      </div>
      <ConsentList />
    </div>
  );
}
