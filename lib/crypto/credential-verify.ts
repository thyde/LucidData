import crypto from 'crypto'

/**
 * Deterministic JSON serialization with recursively sorted object keys.
 * Both signing and verification must serialize the credential payload the same
 * way, so this is the single source of truth for the bytes that get signed.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

/** UTF-8 bytes of the canonical form of a payload — the message that is signed. */
export function canonicalBytes(payload: unknown): Buffer {
  return Buffer.from(canonicalize(payload), 'utf8')
}

/**
 * Verify an Ed25519 signature over a credential payload.
 *
 * @param publicKeyB64  base64(DER SPKI) public key, as stored in issuer_keys.public_key
 * @param payload       the object that was signed (canonicalized internally)
 * @param signatureB64u base64url Ed25519 signature
 */
export function verifyCredentialSignature(
  publicKeyB64: string,
  payload: unknown,
  signatureB64u: string
): boolean {
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    })
    const signature = Buffer.from(signatureB64u, 'base64url')
    return crypto.verify(null, canonicalBytes(payload), publicKey, signature)
  } catch {
    return false
  }
}
