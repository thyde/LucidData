'use client';

import { useState, useMemo } from 'react';
import { useConsentList, useRevokeConsent } from '@/lib/hooks/useConsent';
import { Consent } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConsentCreateDialog } from './consent-create-dialog';
import { ConsentViewDialog } from './consent-view-dialog';
import { format } from 'date-fns';
import { Shield, Search } from 'lucide-react';

interface ConsentListProps {
  vaultDataId?: string;
}

export function ConsentList({ vaultDataId }: ConsentListProps) {
  const { data: consents, isLoading, error } = useConsentList({ vaultDataId });
  const revokeConsent = useRevokeConsent();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked' | 'expired'>('all');
  const [selectedConsentId, setSelectedConsentId] = useState<string | null>(null);

  const getConsentStatus = (consent: Consent): 'active' | 'expired' | 'revoked' => {
    if (consent.revoked) return 'revoked';
    if (consent.endDate && new Date(consent.endDate) < new Date()) return 'expired';
    return 'active';
  };

  const filteredConsents = useMemo(() => {
    if (!consents) return [];

    return consents.filter((consent) => {
      // Status filter
      const status = getConsentStatus(consent);
      if (statusFilter !== 'all' && status !== statusFilter) return false;

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          consent.grantedToName.toLowerCase().includes(searchLower) ||
          consent.purpose.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  }, [consents, statusFilter, searchTerm]);

  const handleRevoke = async (consentId: string) => {
    // For simple revoke without reason dialog, use a default reason
    await revokeConsent.mutateAsync({ id: consentId, reason: 'Revoked by user' });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Consent Management</h2>
            <p className="text-muted-foreground">
              Manage who has access to your data
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
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Consent Management</h2>
            <p className="text-muted-foreground">
              Manage who has access to your data
            </p>
          </div>
          <ConsentCreateDialog trigger={<Button>Grant Consent</Button>} />
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Error loading consents</CardTitle>
            <CardDescription className="text-red-800">Failed to load consents. Please try again.</CardDescription>
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Consent Management</h2>
          <p className="text-muted-foreground">
            Manage who has access to your data
          </p>
        </div>
        <ConsentCreateDialog trigger={<Button>Grant Consent</Button>} />
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by organization or purpose..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'revoked' | 'expired')}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      {filteredConsents.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p>
              {searchTerm || statusFilter !== 'all'
                ? 'No consents match your filters'
                : 'No consents yet. Grant your first consent to allow others to access your data.'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <ConsentCreateDialog
                trigger={<Button className="mt-4">Grant Your First Consent</Button>}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredConsents.map((consent) => {
            const status = getConsentStatus(consent);
            const isExpiringSoon =
              status === 'active' &&
              consent.endDate &&
              new Date(consent.endDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

            return (
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
                        status === 'revoked'
                          ? 'bg-red-100 text-red-800'
                          : status === 'expired'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {status === 'active' ? 'Active' : status === 'revoked' ? 'Revoked' : 'Expired'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Access level: <span className="font-medium">{consent.accessLevel}</span>
                      {consent.endDate && (
                        <span className={isExpiringSoon ? 'text-warning ml-2' : 'ml-2'}>
                          · Expires: {format(new Date(consent.endDate), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedConsentId(consent.id)}
                      >
                        View Details
                      </Button>
                      {status === 'active' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevoke(consent.id)}
                          disabled={revokeConsent.isPending}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedConsentId && (
        <ConsentViewDialog
          consentId={selectedConsentId}
          open={!!selectedConsentId}
          onOpenChange={(open) => !open && setSelectedConsentId(null)}
        />
      )}
    </div>
  );
}
