// Browser-only vault export helpers.
//
// Produces a portable JSON-LD document of decrypted vault entries (and optionally
// the holder's signed credentials). Decryption happens in the browser via the
// existing master key; the server never sees plaintext.

export interface DecryptedExportEntry {
  id: string
  label: string
  category: string
  tags: string[]
  schema_type: string
  description: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
  data: unknown
}

export interface VaultExportInput {
  holderEmail: string
  entries: DecryptedExportEntry[]
  credentials?: unknown[]
}

// Build a JSON-LD vault export document.
export function buildVaultExportDocument(input: VaultExportInput): Record<string, unknown> {
  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      { lucid: 'https://luciddata.app/ns#' },
    ],
    type: ['VerifiablePresentation', 'LucidVaultExport'],
    generatedAt: new Date().toISOString(),
    holder: input.holderEmail,
    vaultEntries: input.entries.map((entry) => ({
      '@type': 'lucid:VaultEntry',
      id: entry.id,
      label: entry.label,
      category: entry.category,
      tags: entry.tags,
      schemaType: entry.schema_type,
      description: entry.description,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
      expiresAt: entry.expires_at,
      data: entry.data,
    })),
    ...(input.credentials && input.credentials.length > 0
      ? { credentials: input.credentials }
      : {}),
  }
}

// Trigger a client-side download of a JSON object.
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/ld+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
