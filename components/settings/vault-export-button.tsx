'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { useEncryption } from '@/lib/context/encryption-context'
import { createClient } from '@/lib/supabase/client'
import { getVaultEntriesAction } from '@/lib/actions/vault.actions'
import { recordDataExportAction } from '@/lib/actions/account.actions'
import { buildVaultExportDocument, downloadJson, type DecryptedExportEntry } from '@/lib/crypto/vault-export'

// Exports the vault as a portable JSON-LD document. Entries are decrypted in the
// browser with the in-memory master key; the server never sees plaintext.
export function VaultExportButton() {
  const { toast } = useToast()
  const { isLocked, decrypt } = useEncryption()
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    setBusy(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const entries = await getVaultEntriesAction()

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
      await recordDataExportAction(decrypted.length)
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
    <Button variant="outline" onClick={handleExport} disabled={busy}>
      <Download className="h-4 w-4" />
      {busy ? 'Preparing…' : 'Export vault (JSON-LD)'}
    </Button>
  )
}
