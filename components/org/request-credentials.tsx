'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/use-toast'
import { VAULT_SCHEMA_TYPES } from '@/lib/schemas/vault-schemas'
import { SCHEMA_FORM_FIELDS } from '@/lib/schemas/form-fields'
import {
  createCredentialRequestAction,
  listOrgCredentialRequestsAction,
  getRequestFulfillmentAction,
} from '@/lib/actions/credential-request.actions'
import type { CredentialRequest } from '@/types/database.types'
import type { FulfilledCredentialView } from '@/lib/services/credential-request.service'

const REQUESTABLE = Object.entries(VAULT_SCHEMA_TYPES).filter(
  ([key]) => key !== 'custom'
) as [string, { label: string; description: string }][]

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  fulfilled: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-700',
}

function schemaLabel(type: string): string {
  return VAULT_SCHEMA_TYPES[type as keyof typeof VAULT_SCHEMA_TYPES]?.label ?? type
}

function fieldLabel(schemaType: string, key: string): string {
  return (SCHEMA_FORM_FIELDS[schemaType] ?? []).find((f) => f.name === key)?.label ?? key
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function RequestCredentials({ orgId }: { orgId: string }) {
  const { toast } = useToast()
  const [subjectEmail, setSubjectEmail] = useState('')
  const [purpose, setPurpose] = useState('')
  const [message, setMessage] = useState('')
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [expiresInDays, setExpiresInDays] = useState('30')
  const [busy, setBusy] = useState(false)
  const [requests, setRequests] = useState<CredentialRequest[]>([])

  const load = useCallback(async () => {
    try {
      setRequests(await listOrgCredentialRequestsAction(orgId))
    } catch {
      /* surfaced on submit; list stays empty */
    }
  }, [orgId])

  useEffect(() => { void load() }, [load])

  function toggleType(key: string) {
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function submit() {
    if (!subjectEmail.trim() || purpose.trim().length < 10 || types.size === 0) {
      toast({
        title: 'A few fields are missing',
        description: 'Add the candidate email, a purpose (10+ characters), and at least one credential type.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    try {
      await createCredentialRequestAction(orgId, {
        subjectEmail,
        purpose,
        requestedSchemaTypes: [...types],
        message: message || undefined,
        expiresInDays: Number(expiresInDays) || 30,
      })
      toast({
        title: 'Request sent',
        description: `If ${subjectEmail} has a Lucid account, it now appears in their requests.`,
      })
      setSubjectEmail('')
      setPurpose('')
      setMessage('')
      setTypes(new Set())
      await load()
    } catch (e) {
      toast({ title: 'Could not send request', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="border rounded-lg p-5 bg-background space-y-4">
        <div>
          <h2 className="font-medium">Request credentials</h2>
          <p className="text-sm text-muted-foreground">
            Ask a candidate to share verifiable credentials. When they respond you can confirm the
            issuer&apos;s signature.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="req-email">Candidate email</Label>
            <Input
              id="req-email"
              type="email"
              value={subjectEmail}
              onChange={(e) => setSubjectEmail(e.target.value)}
              placeholder="doctor@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-expiry">Expires in (days)</Label>
            <Input
              id="req-expiry"
              type="number"
              min="1"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-purpose">Purpose</Label>
          <Input
            id="req-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Pre-employment credential verification"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Credentials requested</Label>
          <div className="grid sm:grid-cols-2 gap-1 border rounded-md p-3">
            {REQUESTABLE.map(([key, meta]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={types.has(key)}
                  onChange={() => toggleType(key)}
                />
                {meta.label}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-message">Message (optional)</Label>
          <Textarea
            id="req-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Add context for the candidate…"
          />
        </div>
        <Button onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</Button>
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Requests you&apos;ve sent</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credential requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <RequestRow key={r.id} orgId={orgId} request={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function RequestRow({ orgId, request }: { orgId: string; request: CredentialRequest }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<FulfilledCredentialView[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function expand() {
    const next = !open
    setOpen(next)
    if (next && items === null) {
      setLoading(true)
      try {
        setItems(await getRequestFulfillmentAction(orgId, request.id))
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <li className="border rounded-lg p-4 bg-background space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium truncate">{request.subject_email}</p>
          <p className="text-sm text-muted-foreground truncate">
            {request.requested_schema_types.map(schemaLabel).join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[request.status]}`}>
            {request.status}
          </span>
          {request.status === 'fulfilled' && (
            <Button variant="outline" size="sm" onClick={expand}>{open ? 'Hide' : 'View'}</Button>
          )}
        </div>
      </div>

      {open && (
        <div className="pt-2 border-t space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !items?.length ? (
            <p className="text-sm text-muted-foreground">Nothing was shared.</p>
          ) : (
            items.map((item) => (
              <div key={item.shareId} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Issued by {item.issuerName}
                      {item.issuerVerified && <span className="text-green-600"> · verified issuer</span>}
                    </p>
                  </div>
                  <span
                    className={item.verification.valid ? 'text-xs font-medium text-green-600' : 'text-xs font-medium text-destructive'}
                    title={item.verification.reasons.join('; ')}
                  >
                    {item.verification.valid ? '✓ Verified' : '✗ Invalid'}
                  </span>
                </div>
                <dl className="divide-y border rounded-md">
                  {Object.entries(item.disclosedClaims).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 px-3 py-1.5 text-sm">
                      <dt className="text-muted-foreground">{fieldLabel(item.schemaType, k)}</dt>
                      <dd className="font-medium text-right">{displayValue(v)}</dd>
                    </div>
                  ))}
                </dl>
                {Object.keys(item.disclosedClaims).length === 0 && (
                  <p className="text-sm text-muted-foreground">No fields disclosed.</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </li>
  )
}
