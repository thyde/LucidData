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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/consent')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        setConsents(Array.isArray(data) ? data : []);
        setError(null);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching consents:', error);
        setError(error instanceof Error ? error.message : 'Failed to load consents');
        setConsents([]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Consents</h1>
            <p className="text-muted-foreground mt-1">
              Manage who can access your data
            </p>
          </div>
          <Button disabled>Grant Consent</Button>
        </div>
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          Loading consents...
        </div>
      </div>
    );
  }

  if (error) {
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
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Error loading consents</CardTitle>
            <CardDescription className="text-red-800">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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

      {consents.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No consents yet. Grant your first consent to allow others to access your data.</p>
          </CardContent>
        </Card>
      ) : (
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
      )}
    </div>
  );
}
