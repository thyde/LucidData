'use client';

import { useState, useMemo } from 'react';
import { useConsentList } from '@/lib/hooks/useConsent';
import { Consent } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConsentCreateDialog } from './consent-create-dialog';
import { ConsentViewDialog } from './consent-view-dialog';
import { format } from 'date-fns';
import { Shield, Search, AlertCircle } from 'lucide-react';

interface ConsentListProps {
  vaultDataId?: string;
}

export function ConsentList({ vaultDataId }: ConsentListProps) {
  const { data: consents, isLoading, error } = useConsentList({ vaultDataId });
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-full bg-gray-200 animate-pulse rounded" />
        <div className="h-32 w-full bg-gray-200 animate-pulse rounded" />
        <div className="h-32 w-full bg-gray-200 animate-pulse rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <AlertCircle className="mx-auto h-12 w-12 mb-4" />
        <p>Failed to load consents. Please try again.</p>
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
          onChange={(e) => setStatusFilter(e.target.value as any)}
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
          <CardContent className="py-12 text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== 'all'
                ? 'No consents match your filters'
                : 'No consents granted yet'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <ConsentCreateDialog
                trigger={<Button className="mt-4">Grant Your First Consent</Button>}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredConsents.map((consent) => {
            const status = getConsentStatus(consent);
            const isExpiringSoon =
              status === 'active' &&
              consent.endDate &&
              new Date(consent.endDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

            return (
              <Card key={consent.id} className="cursor-pointer hover:border-primary transition-colors">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{consent.grantedToName}</CardTitle>
                    <Badge
                      variant={
                        status === 'active'
                          ? 'default'
                          : status === 'revoked'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {consent.purpose}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Access:</span>
                      <span className="font-medium capitalize">{consent.accessLevel}</span>
                    </div>
                    {consent.endDate && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Expires:</span>
                        <span className={isExpiringSoon ? 'text-warning font-medium' : ''}>
                          {format(new Date(consent.endDate), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                    {!consent.endDate && status === 'active' && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration:</span>
                        <span>No expiration</span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    onClick={() => setSelectedConsentId(consent.id)}
                  >
                    View Details
                  </Button>
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
