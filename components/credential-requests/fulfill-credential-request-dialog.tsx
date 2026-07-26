'use client'

import { useMemo, useState } from 'react'
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
import { SCHEMA_FORM_FIELDS } from '@/lib/schemas/form-fields'
import type { CredentialRequest } from '@/types/database.types'

type RequestWithOrg = CredentialRequest & { organization: { name: string; email: string } | null }

function schemaLabel(type: string): string {
  return VAULT_SCHEMA_TYPES[type as keyof typeof VAULT_SCHEMA_TYPES]?.label ?? type
}

function claimLabel(schemaType: string, key: string): string {
  return SCHEMA_FORM_FIELDS[schemaType]?.find((field) => field.name === key)?.label ?? key
}

interface Props {
  open: boolean
  request: RequestWithOrg
  onClose: () => void
}

export function FulfillCredentialRequestDialog({ open, request, onClose }: Props) {
  const queryClient = useQueryClient()
  const [selectionOverride, setSelectionOverride] = useState<{
    requestId: string
    ids: Set<string>
  } | null>(null)
  const [claimOverride, setClaimOverride] = useState<{
    requestId: string
    claims: Map<string, Set<string>>
  } | null>(null)

  const { data: credentials, isLoading } = useQuery({
    queryKey: ['my-credentials'],
    queryFn: getMyCredentialsAction,
  })

  // Owned, claimed credentials whose schema type matches what was requested.
  const matching = useMemo(
    () =>
      (credentials ?? []).filter(
        (credential) =>
          credential.credential.subject_user_id &&
          credential.credential.claimed_at &&
          request.requested_schema_types.includes(credential.credential.schema_type)
      ),
    [credentials, request.requested_schema_types]
  )

  const preselectedIds = useMemo(
    () => new Set(matching.filter((credential) => credential.verification.valid).map(
      (credential) => credential.credential.id
    )),
    [matching]
  )
  const selectedIds =
    selectionOverride?.requestId === request.id ? selectionOverride.ids : preselectedIds

  function selectedClaims(credentialId: string, claims: Record<string, unknown>): Set<string> {
    if (claimOverride?.requestId === request.id) {
      const overridden = claimOverride.claims.get(credentialId)
      if (overridden) return overridden
    }
    return new Set(Object.keys(claims))
  }

  const fulfill = useMutation({
    mutationFn: () => {
      const selections = matching
        .filter((m) => selectedIds.has(m.credential.id))
        .map((m) => ({
          credentialId: m.credential.id,
          disclosedClaims: Array.from(
            selectedClaims(
              m.credential.id,
              (m.credential.claims ?? {}) as Record<string, unknown>
            )
          ),
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
    setSelectionOverride(() => {
      const next = new Set(selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { requestId: request.id, ids: next }
    })
  }

  function toggleClaim(
    credentialId: string,
    claim: string,
    availableClaims: Record<string, unknown>
  ) {
    setClaimOverride((current) => {
      const claims = new Map(
        current?.requestId === request.id ? current.claims : undefined
      )
      const selected = new Set(
        claims.get(credentialId) ?? Object.keys(availableClaims)
      )
      if (selected.has(claim)) selected.delete(claim)
      else selected.add(claim)
      claims.set(credentialId, selected)
      return { requestId: request.id, claims }
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
                {matching.map((m) => {
                  const claims = (m.credential.claims ?? {}) as Record<string, unknown>
                  const disclosed = selectedClaims(m.credential.id, claims)
                  const selected = selectedIds.has(m.credential.id)
                  return (
                    <div key={m.credential.id} className="space-y-2 py-1">
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          checked={selected}
                          onChange={() => toggle(m.credential.id)}
                          disabled={!m.verification.valid}
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{m.credential.label}</span>{' '}
                          <span className="text-muted-foreground">
                            · {schemaLabel(m.credential.schema_type)} · {m.issuerName}
                          </span>
                          {!m.verification.valid && (
                            <span className="text-destructive"> · not valid</span>
                          )}
                        </span>
                      </label>
                      {selected && (
                        <div className="ml-6 grid gap-1 sm:grid-cols-2">
                          {Object.keys(claims).map((claim) => (
                            <label key={claim} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={disclosed.has(claim)}
                                onChange={() => toggleClaim(m.credential.id, claim, claims)}
                                aria-label={`Share ${claimLabel(m.credential.schema_type, claim)} from ${m.credential.label}`}
                              />
                              {claimLabel(m.credential.schema_type, claim)}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Choose the fields to disclose from each credential. The requester can verify the
                issuer&apos;s signature without receiving the omitted fields.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={() => deny.mutate()} disabled={busy}>Deny</Button>
          <Button
            onClick={() => fulfill.mutate()}
            disabled={
              busy ||
              selectedIds.size === 0 ||
              matching.some(
                (credential) =>
                  selectedIds.has(credential.credential.id) &&
                  selectedClaims(
                    credential.credential.id,
                    (credential.credential.claims ?? {}) as Record<string, unknown>
                  ).size === 0
              )
            }
          >
            {fulfill.isPending ? 'Sharing…' : 'Share selected'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
