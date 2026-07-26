/**
 * LD-401 credential format export.
 *
 * Turns a credential LucidData already issued into whichever registered format
 * the holder asks for. The claims, the issuer, the identifier, and the issuance
 * time all stay the same; only the encoding changes, and the issuer re-signs
 * because a signature is over bytes and the bytes are different.
 *
 * That re-signature is worth being explicit about. It is the issuer attesting
 * the same statement in another encoding, not a new credential: the credential
 * id and `issued_at` are carried through, so two formats of one credential are
 * recognisably the same thing and neither is fresher than the other.
 *
 * Formats that support selective disclosure are exported whole. Choosing what
 * to withhold is the holder's action at presentation time, not ours at export
 * time, and doing it here would mean deciding on their behalf.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { getFormat, type IssuedArtifact, type IssuerSigner } from '@/lib/credentials/formats'
import { getOrCreateActiveIssuerKey } from '@/lib/services/issuer-key.service'
import { signBytesWithPrivateKey } from '@/lib/crypto/credential-signing'
import { createAuditEntry } from '@/lib/services/audit.service'
import type { IssuedCredential } from '@/types/database.types'

export interface FormatExport {
  format: string
  version: string
  label: string
  /** The bytes a verifier checks. */
  serialized: string
  document: Record<string, unknown>
  keyId: string
}

/**
 * Export a credential the given user holds, in a named format.
 *
 * Scoped to `subject_user_id` so a credential can only be exported by the
 * person it is about, never by anyone who knows its identifier.
 */
export async function exportCredentialAs(
  userId: string,
  credentialId: string,
  format: string,
  version?: string
): Promise<FormatExport> {
  // Resolve the format first. An unsupported format must fail before any
  // credential is read, so an unknown name cannot be used to probe for
  // credential existence.
  const definition = getFormat(format, version)

  const service = createServiceClient()
  const { data, error } = await service
    .from('issued_credentials')
    .select('*')
    .eq('id', credentialId)
    .eq('subject_user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Credential not found')

  const credential = data as IssuedCredential

  const { data: org } = await service
    .from('organizations')
    .select('name, domain, verified_at')
    .eq('id', credential.organization_id)
    .maybeSingle()

  const key = await getOrCreateActiveIssuerKey(credential.organization_id)
  const signer: IssuerSigner = {
    keyId: key.key_id,
    // The private key stays inside lib/crypto. This hands over the ability to
    // sign, not the key itself.
    sign: (message: Buffer) =>
      signBytesWithPrivateKey(key.encrypted_private_key, key.private_key_iv, message),
  }

  const artifact: IssuedArtifact = definition.issue(
    {
      credentialId: credential.id,
      schemaType: credential.schema_type,
      label: credential.label,
      subjectEmail: credential.subject_email,
      claims: (credential.claims ?? {}) as Record<string, unknown>,
      issuerName: org?.name ?? 'Unknown issuer',
      // A did:web identifier asserts the issuer controls that domain, so it is
      // only used when the domain was actually verified.
      issuerDomain: org?.verified_at ? (org?.domain ?? null) : null,
      issuerOrgId: credential.organization_id,
      issuedAt: credential.issued_at,
      expiresAt: credential.expires_at,
    },
    signer
  )

  await createAuditEntry({
    userId,
    eventType: 'credential_exported',
    action: `Exported a credential as ${definition.label}`,
    metadata: {
      credential_id: credential.id,
      format: artifact.formatVersion.format,
      format_version: artifact.formatVersion.version,
      key_id: artifact.keyId,
    },
  })

  return {
    format: artifact.formatVersion.format,
    version: artifact.formatVersion.version,
    label: definition.label,
    serialized: artifact.serialized,
    document: artifact.document,
    keyId: artifact.keyId,
  }
}
