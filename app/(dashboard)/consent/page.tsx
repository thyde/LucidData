'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Consent {
  id: string;
  grantedToName: string;
  accessLevel: string;
  purpose: string;
  revoked: boolean;
  createdAt: string;
  revokedAt?: string;
}

export default function ConsentPage() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/consent')
      .then((res) => res.json())
      .then((data) => {
        setConsents(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching consents:', error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Consents</h1>
          <p className="text-muted-foreground mt-1">
            Manage who can access your data
          </p>
        </div>
        <Button>Grant Consent</Button>
      </div>

      <div className="grid gap-4">
        {consents.map((consent) => (
          <Card key={consent.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{consent.grantedToName}</CardTitle>
                  <CardDescription className="mt-1">
                    {consent.purpose}
                  </CardDescription>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                    consent.revoked
                      ? 'bg-red-100 text-red-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {consent.revoked ? 'Revoked' : 'Active'}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Access level: <span className="font-medium">{consent.accessLevel}</span>
                </div>
                {!consent.revoked && (
                  <Button variant="destructive" size="sm">
                    Revoke
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
