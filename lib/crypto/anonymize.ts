// Browser-side anonymization helpers for marketplace contributions.
// Direct identifiers are removed before any field leaves the device. The user
// additionally chooses which remaining fields to share (an allowlist).

/** Field keys treated as direct identifiers and excluded from contributions by default. */
export const IDENTIFIER_KEYS = new Set([
  'name',
  'full_name',
  'fullname',
  'first_name',
  'last_name',
  'email',
  'email_address',
  'phone',
  'phone_number',
  'ssn',
  'social_security',
  'social_security_number',
  'address',
  'street',
  'street_address',
  'passport',
  'license',
  'drivers_license',
  'account_number',
  'card_number',
  'dob',
  'date_of_birth',
])

export function isIdentifierField(key: string): boolean {
  return IDENTIFIER_KEYS.has(key.toLowerCase().replace(/\s+/g, '_'))
}

export interface FieldEntry {
  key: string
  value: unknown
  isIdentifier: boolean
}

/** Flatten a decrypted vault `data` object into displayable field entries. */
export function toFieldEntries(data: Record<string, unknown> | string | null): FieldEntry[] {
  if (!data || typeof data !== 'object') return []
  return Object.entries(data).map(([key, value]) => ({
    key,
    value,
    isIdentifier: isIdentifierField(key),
  }))
}

/**
 * Build the anonymized payload from the chosen field keys, dropping any identifier
 * fields as a safety net even if selected.
 */
export function buildAnonymizedPayload(
  data: Record<string, unknown> | string | null,
  selectedKeys: string[]
): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const payload: Record<string, unknown> = {}
  for (const key of selectedKeys) {
    if (isIdentifierField(key)) continue
    if (key in data) payload[key] = (data as Record<string, unknown>)[key]
  }
  return payload
}
