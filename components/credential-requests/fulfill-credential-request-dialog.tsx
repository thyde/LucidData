'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getMyCredentialsAction } from '@/lib/actions/credential.actions'
import {
  fulfillCredentialRequestAction,
  denyCredentialRequestAction,
} from '@/lib/actions/credential-request.actions'
import { VAULT_SCHEMA_TYPES } from '@/lib/schemas/vault-schemas'
import type { CredentialRequest } from '@/types/database.types'

type RequestWithOrg = CredentialRequest & { organization: { name: string; email: string } | null }

function schemaLabel(type: string): string {
  return VAULT_SCHEMA_TYPES[type as keyof typeof VAULT_SCHEMA_TYPES]?.label ?? type
}

interface Props {
  open: boolean
  request: RequestWithOrg
  onClose: () => void
}

export function FulfillCredentialRequestDialog({ open, request, onClose }: Props) {
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: credentials, isLoading } = useQuery({
    queryKey: ['my-credentials'],
    queryFn: getMyCredentialsAction,
  })

  // Owned, claimed credentials whose schema type matches what was requested.
  const matching = (credentials ?? []).filter(
    (c) =>
      c.credential.subject_user_id &&
      c.credential.claimed_at &&
      request.requested_schema_types.includes(c.credential.schema_type)
  )

  // Preselect valid matches once credentials load.
  useEffect(() => {
    setSelectedIds(
      new Set(
        (credentials ?? [])
          .filter(
            (c) =>
              c.credential.subject_user_id &&
              c.credential.claimed_at &&
              request.requested_schema_types.includes(c.credential.schema_type) &&
              c.verification.valid
          )
          .map((c) => c.credential.id)
      )
    )
  }, [credentials, request.requested_schema_types])

  const fulfill = useMutation({
    mutationFn: () => {
      const selections = matching
        .filter((m) => selectedIds.has(m.credential.id))
        .map((m) => ({
          credentialId: m.credential.id,
          disclosedClaims: Object.keys((m.credential.claims ?? {}) as Record<string, unknown>),
        }))
      return fulfillCredentialRequestAction(request.id, selections)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credential-requests'] })
      onClose()
    },
  })

  const deny = useMutation({
    mutationFn: () => denyCredentialRequestAction(request.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credential-requests'] })
      onClose()
    },
  })

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const busy = fulfill.isPending || deny.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share credentials</DialogTitle>
          <DialogDescription>
            {request.organization?.name} requested: {request.requested_schema_types.map(schemaLabel).join(', ')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-4 text-sm space-y-1">
            <p><span className="font-medium">Purpose:</span> {request.purpose}</p>
            {request.message && <p><span className="font-medium">Message:</span> {request.message}</p>}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your credentials…</p>
          ) : matching.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You don&apos;t have any claimed credentials matching this request. Claim matching
              credentials in your Credentials inbox first, then come back.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Choose credentials to share</p>
              <div className="space-y-1 border rounded-md p-3 max-h-60 overflow-auto">
                {matching.map((m) => (
                  <label key={m.credential.id} className="flex items-start gap-2 text-sm py-1">
                    <input
                      type="checkbox"
                      className="h-4 w-4 mt-0.5"
                      checked={selectedIds.has(m.credential.id)}
                      onChange={() => toggle(m.credential.id)}
                      disabled={!m.verification.valid}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{m.credential.label}</span>{' '}
                      <span className="text-muted-foreground">
                        · {schemaLabel(m.credential.schema_type)} · {m.issuerName}
                      </span>
                      {!m.verification.valid && <span className="text-destructive"> · not valid</span>}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                All fields of each selected credential are shared with the requester, who can verify
                the issuer&apos;s signature. For field-by-field control, use Share in your Credentials inbox.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={() => deny.mutate()} disabled={busy}>Deny</Button>
          <Button onClick={() => fulfill.mutate()} disabled={busy || selectedIds.size === 0}>
            {fulfill.isPending ? 'Sharing…' : 'Share selected'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
