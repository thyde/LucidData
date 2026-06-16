'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'
import { SchemaForm } from '@/components/vault/schema-form'
import { VAULT_SCHEMA_TYPES } from '@/lib/schemas/vault-schemas'
import { SCHEMA_FORM_FIELDS } from '@/lib/schemas/form-fields'
import { issueCredentialAction } from '@/lib/actions/credential.actions'
import { revokeCredentialAction } from '@/lib/actions/credential.actions'
import type { IssuedCredential } from '@/types/database.types'

// Issuer-relevant schema types (exclude free-form custom and personal-only types).
const ISSUABLE_TYPES = Object.entries(VAULT_SCHEMA_TYPES).filter(
  ([key]) => key !== 'custom'
) as [string, { label: string; description: string }][]

interface IssueCredentialProps {
  orgId: string
  issued: IssuedCredential[]
}

export function IssueCredential({ orgId, issued }: IssueCredentialProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [schemaType, setSchemaType] = useState('education')
  const [subjectEmail, setSubjectEmail] = useState('')
  const [label, setLabel] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [claims, setClaims] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const fields = SCHEMA_FORM_FIELDS[schemaType] ?? []
  async function handleIssue() {
    setBusy(true)
    try {
      await issueCredentialAction(orgId, {
        subjectEmail,
        schemaType,
        label,
        claims,
        expiresAt: expiresAt || null,
      })
      toast({ title: 'Credential issued', description: `Issued to ${subjectEmail}` })
      setSubjectEmail('')
      setLabel('')
      setExpiresAt('')
      setClaims({})
      router.refresh()
    } catch (e) {
      toast({ title: 'Could not issue credential', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this credential? Verifiers will no longer trust it.')) return
    setRevokingId(id)
    try {
      await revokeCredentialAction(orgId, id, 'Revoked by issuer')
      toast({ title: 'Credential revoked' })
      router.refresh()
    } catch (e) {
      toast({ title: 'Could not revoke', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setRevokingId(null)
    }
  }
  return (
    <div className="space-y-6">
      <section className="border rounded-lg p-5 bg-background space-y-4">
        <h2 className="font-medium">Issue a credential</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cred-type">Credential type</Label>
            <select
              id="cred-type"
              aria-label="Credential type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={schemaType}
              onChange={(e) => { setSchemaType(e.target.value); setClaims({}) }}
            >
              {ISSUABLE_TYPES.map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject-email">Subject email</Label>
            <Input
              id="subject-email"
              type="email"
              value={subjectEmail}
              onChange={(e) => setSubjectEmail(e.target.value)}
              placeholder="graduate@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cred-label">Label</Label>
            <Input
              id="cred-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="BSc Computer Science"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cred-expires">Expires (optional)</Label>
            <Input
              id="cred-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <SchemaForm fields={fields} value={claims} onChange={setClaims} />
        </div>

        <Button onClick={handleIssue} disabled={busy || !subjectEmail.trim() || !label.trim()}>
          {busy ? 'Issuing…' : 'Issue credential'}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Issued credentials ({issued.length})</h2>
        {issued.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credentials issued yet.</p>
        ) : (
          <ul className="space-y-2">
            {issued.map((c) => (
              <li key={c.id} className="border rounded-lg p-4 bg-background flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{c.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.subject_email} · {VAULT_SCHEMA_TYPES[c.schema_type as keyof typeof VAULT_SCHEMA_TYPES]?.label ?? c.schema_type}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs">
                    <span className={c.status === 'active' ? 'text-green-600' : 'text-destructive'}>
                      {c.status}
                    </span>
                    <p className="text-muted-foreground">
                      {c.claimed_at ? 'claimed' : 'unclaimed'}
                    </p>
                  </div>
                  {c.status === 'active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(c.id)}
                      disabled={revokingId === c.id}
                    >
                      {revokingId === c.id ? 'Revoking…' : 'Revoke'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
