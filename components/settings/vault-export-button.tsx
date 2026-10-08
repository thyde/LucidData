'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { useEncryption } from '@/lib/context/encryption-context'
import { createClient } from '@/lib/supabase/client'
import { getVaultExportEntriesAction, recordDataExportAction } from '@/lib/actions/account.actions'
import { StepUpDialog } from '@/components/auth/step-up-dialog'
import { buildVaultExportDocument, type DecryptedExportEntry } from '@luciddata/core/crypto/vault-export'
import { downloadJson } from '@/lib/utils/download'
import { unwrap } from '@/lib/actions/unwrap'

// Exports the vault as a portable JSON-LD document. Entries are decrypted in the
// browser with the in-memory master key; the server never sees plaintext.
// LD-106: a full copy of everything needs the password again first.
export function VaultExportButton() {
  const { toast } = useToast()
  const { isLocked, decrypt } = useEncryption()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleExport(stepUpToken: string) {
    setBusy(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const entries = await unwrap(getVaultExportEntriesAction({ stepUpToken }))

      const decrypted: DecryptedExportEntry[] = await Promise.all(
        entries.map(async (entry) => {
          const plaintext = await decrypt(entry.client_ciphertext, entry.encrypted_dek, entry.dek_salt)
          let data: unknown
          try {
            data = JSON.parse(plaintext)
          } catch {
            data = plaintext
          }
          return {
            id: entry.id,
            label: entry.label,
            category: entry.category,
            tags: entry.tags,
            schema_type: entry.schema_type,
            description: entry.description,
            created_at: entry.created_at,
            updated_at: entry.updated_at,
            expires_at: entry.expires_at,
            data,
          }
        })
      )

      const doc = buildVaultExportDocument({
        holderEmail: user?.email ?? 'unknown',
        entries: decrypted,
      })
      downloadJson('lucid-vault-export.jsonld', doc)
      await unwrap(recordDataExportAction(decrypted.length))
      toast({
        title: 'Vault exported',
        description: `${decrypted.length} ${decrypted.length === 1 ? 'entry' : 'entries'} downloaded`,
      })
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  if (isLocked) {
    return (
      <Button variant="outline" disabled title="Unlock your vault to export">
        <Download className="h-4 w-4" />
        Unlock your vault to export
      </Button>
    )
  }

  return (
    <>
      <Button variant="outline" onClick={() => setConfirming(true)} disabled={busy}>
        <Download className="h-4 w-4" />
        {busy ? 'Preparing…' : 'Export vault (JSON-LD)'}
      </Button>
      <StepUpDialog
        action="export_vault"
        title="Export your vault"
        description="Confirm your password to download a decrypted copy of every entry. Anyone who gets the file can read it."
        open={confirming}
        onOpenChange={setConfirming}
        onConfirmed={handleExport}
      />
    </>
  )
}
