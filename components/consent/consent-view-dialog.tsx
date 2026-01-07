'use client';

import { useState } from 'react';
import { useConsentEntry } from '@/lib/hooks/useConsent';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConsentRevokeDialog } from './consent-revoke-dialog';
import { ConsentExtendDialog } from './consent-extend-dialog';
import { format } from 'date-fns';
import { Shield, Calendar, User, AlertTriangle } from 'lucide-react';

interface ConsentViewDialogProps {
  consentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConsentViewDialog({ consentId, open, onOpenChange }: ConsentViewDialogProps) {
  const { data: consent, isLoading } = useConsentEntry(consentId);
  const [showRevoke, setShowRevoke] = useState(false);
  const [showExtend, setShowExtend] = useState(false);

  if (isLoading || !consent) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consent Details</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">Loading...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const status = consent.revoked
    ? 'revoked'
    : consent.endDate && new Date(consent.endDate) < new Date()
    ? 'expired'
    : 'active';

  const isExpiringSoon =
    status === 'active' &&
    consent.endDate &&
    new Date(consent.endDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  return (
    <>
      <Dialog open={open && !showRevoke && !showExtend} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex justify-between items-start">
              <div>
                <DialogTitle className="text-2xl">{consent.grantedToName}</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  {consent.grantedTo}
                </DialogDescription>
              </div>
              <Badge
                variant={
                  status === 'active'
                    ? 'default'
                    : status === 'revoked'
                    ? 'destructive'
                    : 'secondary'
                }
                className="text-sm"
              >
                {status.toUpperCase()}
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Access Details */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Access Details
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Access Level:</span>
                  <span className="font-medium capitalize">{consent.accessLevel}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Purpose:</span>
                  <p className="mt-1">{consent.purpose}</p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Timeline
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Granted on:</span>
                  <span>{format(new Date(consent.createdAt), 'MMM d, yyyy h:mm a')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Starts:</span>
                  <span>{format(new Date(consent.startDate), 'MMM d, yyyy')}</span>
                </div>
                {consent.endDate ? (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Expires:</span>
                    <div className="flex items-center gap-2">
                      {isExpiringSoon && (
                        <AlertTriangle className="h-4 w-4 text-warning" />
                      )}
                      <span className={isExpiringSoon ? 'text-warning font-medium' : ''}>
                        {format(new Date(consent.endDate), 'MMM d, yyyy')}
                        {isExpiringSoon && ' (Soon)'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span>No expiration</span>
                  </div>
                )}
                {consent.revoked && consent.revokedAt && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revoked on:</span>
                      <span>{format(new Date(consent.revokedAt), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                    {consent.revokedReason && (
                      <div>
                        <span className="text-muted-foreground">Reason:</span>
                        <p className="mt-1">{consent.revokedReason}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Legal/Compliance */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Legal & Compliance
              </h3>
              <div className="space-y-2 text-sm">
                {consent.ipAddress && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IP Address:</span>
                    <span className="font-mono">{consent.ipAddress}</span>
                  </div>
                )}
                {consent.userAgent && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User Agent:</span>
                    <span className="font-mono text-xs truncate max-w-xs">
                      {consent.userAgent}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Terms Version:</span>
                  <span>{consent.termsVersion}</span>
                </div>
                {consent.grantedToEmail && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact:</span>
                    <span>{consent.grantedToEmail}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {status === 'active' && (
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    onOpenChange(false);
                    setShowExtend(true);
                  }}
                >
                  Extend Consent
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    onOpenChange(false);
                    setShowRevoke(true);
                  }}
                >
                  Revoke Consent
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {showRevoke && (
        <ConsentRevokeDialog
          consentId={consentId}
          consentName={consent.grantedToName}
          open={showRevoke}
          onOpenChange={(open) => {
            setShowRevoke(open);
            if (!open) onOpenChange(false);
          }}
        />
      )}

      {showExtend && (
        <ConsentExtendDialog
          consentId={consentId}
          currentEndDate={consent.endDate}
          open={showExtend}
          onOpenChange={(open) => {
            setShowExtend(open);
            if (!open) onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
