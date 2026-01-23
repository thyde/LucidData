'use client';

import { useState, useEffect } from 'react';
import { useVaultEntry, useDeleteVault } from '@/lib/hooks/useVault';
import { useConsentList } from '@/lib/hooks/useConsent';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConsentCreateDialog } from '@/components/consent/consent-create-dialog';
import { Share2 } from 'lucide-react';

interface VaultViewDialogProps {
  entryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditClick?: (entryId: string) => void;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return false;
  return new Date() > new Date(expiresAt);
}

function getCategoryVariant(category: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (category) {
    case 'health':
      return 'default';
    case 'financial':
      return 'secondary';
    case 'personal':
      return 'outline';
    case 'credentials':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function VaultViewDialog({ entryId, open, onOpenChange, onEditClick }: VaultViewDialogProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConsentCreate, setShowConsentCreate] = useState(false);
  const [deleteCompleted, setDeleteCompleted] = useState(false);
  const { data: entry, isLoading, isError, error } = useVaultEntry(entryId);
  const deleteMutation = useDeleteVault();
  const { data: consents } = useConsentList({ vaultDataId: entryId, active: true });

  const handleDelete = () => {
    deleteMutation.mutate(entryId, {
      onSuccess: () => setDeleteCompleted(true),
      onError: (mutationError) => {
        // Error is already handled by mutation's onError handler (toast notification)
        // Keep the dialog open so user can try again
        console.error('Delete failed:', mutationError);
      },
    });
  };

  // Close dialogs when deletion is complete
  useEffect(() => {
    if (deleteCompleted) {
      setShowDeleteDialog(false);
      onOpenChange(false);
      setDeleteCompleted(false);
    }
  }, [deleteCompleted, onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isLoading ? 'Loading...' : isError ? 'Error' : entry?.label || 'Vault Entry'}
            </DialogTitle>
          </DialogHeader>
          {isLoading && <div className="p-4 text-center">Loading vault entry...</div>}
          {isError && (
            <div className="p-4 space-y-2">
              <p className="text-destructive font-medium">
                {error instanceof Error ? error.message : 'Failed to load entry'}
              </p>
              <p className="text-sm text-muted-foreground">
                Please check the browser console for more details or try refreshing the page.
              </p>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="mt-2"
              >
                Close
              </Button>
            </div>
          )}
          {entry && !isLoading && !isError && (
            <>

              <div className="space-y-4">
                {/* Label Section */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Label</h3>
                  <p className="text-base">{entry.label}</p>
                </div>

                {/* Category Badge */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Category</h3>
                  <Badge variant={getCategoryVariant(entry.category)}>
                    {entry.category}
                  </Badge>
                </div>

                {/* Description */}
                {entry.description && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                    <p className="text-sm">{entry.description}</p>
                  </div>
                )}

                {/* Tags */}
                {entry.tags && entry.tags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Tags</h3>
                    <div className="flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Type */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Data Type</h3>
                  <p className="text-sm">{entry.dataType}</p>
                </div>

                {/* JSON Data */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Data</h3>
                  <pre className="bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(entry.data, null, 2)}
                  </pre>
                </div>

                {/* Schema Type */}
                {entry.schemaType && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Schema Type</h3>
                    <p className="text-sm">{entry.schemaType}</p>
                  </div>
                )}

                {/* Schema Version */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Schema Version</h3>
                  <p className="text-sm">{entry.schemaVersion}</p>
                </div>

                {/* Expiration */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Expires At</h3>
                  {entry.expiresAt ? (
                    <div className="flex items-center gap-2">
                      <p className="text-sm">{formatDate(entry.expiresAt)}</p>
                      {isExpired(entry.expiresAt) && (
                        <Badge variant="destructive">Expired</Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm">No expiration</p>
                  )}
                </div>

                {/* Sharing & Consent Section */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Sharing & Consent</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false);
                        setShowConsentCreate(true);
                      }}
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Share this data
                    </Button>
                  </div>
                  {consents && consents.length > 0 ? (
                    <div className="text-sm text-muted-foreground">
                      <p>
                        Active consents: <span className="font-medium text-foreground">{consents.length}</span>
                      </p>
                      <p className="mt-1">
                        Shared with: {consents.map(c => c.grantedToName).join(', ')}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Not currently shared with any organization
                    </p>
                  )}
                </div>

                {/* Timestamps */}
                <div className="pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium">Created:</span>{' '}
                      {formatDate(entry.createdAt)}
                    </div>
                    <div>
                      <span className="font-medium">Updated:</span>{' '}
                      {formatDate(entry.updatedAt)}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="default"
                  onClick={() => onEditClick?.(entryId)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{entry?.label}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConsentCreateDialog
        open={showConsentCreate}
        onOpenChange={setShowConsentCreate}
        preselectedVaultDataId={entryId}
      />
    </>
  );
}
