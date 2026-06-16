'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { useEncryption } from '@/lib/context/encryption-context'
import {
  getMyCredentialsAction,
  claimCredentialAction,
  linkCredentialVaultEntryAction,
  exportCredentialVcAction,
  type MyCredential,
} from '@/lib/actions/credential.actions'
import { createVaultEntryAction } from '@/lib/actions/vault.actions'
import { VAULT_SCHEMA_TYPES } from '@/lib/schemas/vault-schemas'
import { ShareCredentialDialog } from '@/components/credentials/share-credential-dialog'

function schemaLabel(type: string): string {
  return VAULT_SCHEMA_TYPES[type as keyof typeof VAULT_SCHEMA_TYPES]?.label ?? type
}

export function CredentialsInbox() {
  const { toast } = useToast()
  const { isLocked, encrypt } = useEncryption()
  const [items, setItems] = useState<MyCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [shareTarget, setShareTarget] = useState<MyCredential | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await getMyCredentialsAction())
    } catch (e) {
      toast({ title: 'Could not load credentials', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  async function handleClaim(item: MyCredential) {    const cred = item.credential
    setClaimingId(cred.id)
    try {
      await claimCredentialAction(cred.id)

      // Store an end-to-end encrypted copy in the vault when it's unlocked.
      if (!isLocked) {
        const plaintext = JSON.stringify({
          id: cred.id,
          label: cred.label,
          schema_type: cred.schema_type,
          claims: cred.claims,
          signed_payload: cred.signed_payload,
          signature: cred.signature,
          key_id: cred.key_id,
          issuer: item.issuerName,
          issued_at: cred.issued_at,
          expires_at: cred.expires_at,
        })
        const enc = await encrypt(plaintext)
        const entry = await createVaultEntryAction({
          label: cred.label,
          category: 'credentials',
          schema_type: 'verifiable_credential',
          description: `Issued by ${item.issuerName}`,
          client_ciphertext: enc.client_ciphertext,
          encrypted_dek: enc.encrypted_dek,
          dek_salt: enc.dek_salt,
          expires_at: cred.expires_at ?? undefined,
        })
        await linkCredentialVaultEntryAction(cred.id, entry.id)
        toast({ title: 'Credential claimed', description: 'Saved an encrypted copy to your vault.' })
      } else {
        toast({
          title: 'Credential claimed',
          description: 'Unlock your vault to save an encrypted copy.',
        })
      }
      await load()
    } catch (e) {
      toast({ title: 'Could not claim credential', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setClaimingId(null)
    }
  }

  async function handleExport(item: MyCredential) {
    try {
      const vc = await exportCredentialVcAction(item.credential.id)
      const blob = new Blob([JSON.stringify(vc, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${item.credential.label.replace(/\s+/g, '-').toLowerCase()}.vc.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast({ title: 'Could not export', description: (e as Error).message, variant: 'destructive' })
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading credentials…</p>
  }

  const claimable = items.filter((i) => !i.credential.subject_user_id || !i.credential.claimed_at)
  const owned = items.filter((i) => i.credential.subject_user_id && i.credential.claimed_at)

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">To claim ({claimable.length})</h2>
        {claimable.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credentials waiting to be claimed.</p>
        ) : (
          <ul className="space-y-2">
            {claimable.map((item) => (
              <li key={item.credential.id} className="border rounded-lg p-4 bg-background flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.credential.label}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {item.issuerName}
                    {item.issuerVerified && <span className="text-green-600"> · verified issuer</span>}
                    {' · '}{schemaLabel(item.credential.schema_type)}
                  </p>
                </div>
                <Button
                  onClick={() => handleClaim(item)}
                  disabled={claimingId === item.credential.id}
                >
                  {claimingId === item.credential.id ? 'Claiming…' : 'Claim'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your credentials ({owned.length})</h2>
        {owned.length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven&apos;t claimed any credentials yet.</p>
        ) : (
          <ul className="space-y-2">
            {owned.map((item) => (
              <li key={item.credential.id} className="border rounded-lg p-4 bg-background flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.credential.label}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {item.issuerName}
                    {item.issuerVerified && <span className="text-green-600"> · verified issuer</span>}
                    {' · '}{schemaLabel(item.credential.schema_type)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      item.verification.valid
                        ? 'text-xs font-medium text-green-600'
                        : 'text-xs font-medium text-destructive'
                    }
                    title={item.verification.reasons.join('; ')}
                  >
                    {item.verification.valid ? 'Verified' : 'Invalid'}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setShareTarget(item)}>
                    Share
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleExport(item)}>
                    Export
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shareTarget && (
        <ShareCredentialDialog
          open={!!shareTarget}
          onOpenChange={(open) => { if (!open) setShareTarget(null) }}
          credentialId={shareTarget.credential.id}
          schemaType={shareTarget.credential.schema_type}
          claims={(shareTarget.credential.claims ?? {}) as Record<string, unknown>}
        />
      )}
    </div>
  )
}
