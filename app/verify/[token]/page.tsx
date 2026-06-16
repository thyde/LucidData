import { resolveShareToken } from '@/lib/services/share.service'
import { SCHEMA_FORM_FIELDS } from '@/lib/schemas/form-fields'
import { VAULT_SCHEMA_TYPES } from '@/lib/schemas/vault-schemas'

function fieldLabel(schemaType: string, key: string): string {
  const field = (SCHEMA_FORM_FIELDS[schemaType] ?? []).find((f) => f.name === key)
  return field?.label ?? key
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await resolveShareToken(token)

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <span className="font-semibold text-lg">Lucid</span>
          <span className="text-muted-foreground text-sm"> · credential verification</span>
        </div>

        {!result ? (
          <div className="border rounded-lg p-8 bg-background text-center">
            <h1 className="text-xl font-semibold">Link not found</h1>
            <p className="text-muted-foreground mt-2">
              This verification link is invalid or no longer exists.
            </p>
          </div>
        ) : (
          <div className="border rounded-lg bg-background overflow-hidden">
            <div
              className={
                result.verification.valid
                  ? 'bg-green-50 border-b border-green-200 p-5'
                  : 'bg-red-50 border-b border-red-200 p-5'
              }
            >
              <p className={result.verification.valid ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                {result.verification.valid ? '✓ Verified credential' : '✗ Could not verify'}
              </p>
              {!result.verification.valid && (
                <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                  {result.verification.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>

            <div className="p-5 space-y-4">
              <div>
                <h1 className="text-xl font-semibold">{result.label}</h1>
                <p className="text-sm text-muted-foreground">
                  {VAULT_SCHEMA_TYPES[result.schemaType as keyof typeof VAULT_SCHEMA_TYPES]?.label ?? result.schemaType}
                </p>
              </div>

              <div className="text-sm">
                <span className="text-muted-foreground">Issued by </span>
                <span className="font-medium">{result.issuerName}</span>
                {result.issuerVerified && <span className="text-green-600"> · verified issuer</span>}
              </div>

              <dl className="divide-y border rounded-md">
                {Object.entries(result.disclosedClaims).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 px-4 py-2 text-sm">
                    <dt className="text-muted-foreground">{fieldLabel(result.schemaType, key)}</dt>
                    <dd className="font-medium text-right">{displayValue(value)}</dd>
                  </div>
                ))}
              </dl>
              {Object.keys(result.disclosedClaims).length === 0 && (
                <p className="text-sm text-muted-foreground">No fields disclosed.</p>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Issued {new Date(result.issuedAt).toLocaleDateString()}</p>
                {result.expiresAt && <p>Expires {new Date(result.expiresAt).toLocaleDateString()}</p>}
                <p>The issuer&apos;s signature was checked over the full credential; only the fields above were disclosed.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
