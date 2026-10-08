// Vault export document.
//
// Produces a portable JSON-LD document of decrypted vault entries (and optionally
// the holder's signed credentials). Decryption happens on the person's device via
// the existing master key; the server never sees plaintext. Saving the document
// is the platform's job: the web app uses lib/utils/download.ts.

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
      { lucid: 'https://luciddatabank.com/ns#' },
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
