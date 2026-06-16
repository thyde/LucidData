import crypto from 'crypto'
import { canonicalBytes } from '@/lib/crypto/credential-verify'

// Server-only. Issuer private keys are AES-256-GCM encrypted at rest with
// ISSUER_KEY_SECRET; plaintext key material only exists in memory while signing.
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

export interface GeneratedIssuerKey {
  keyId: string
  /** base64(DER SPKI) — safe to publish; this is the verification key. */
  publicKey: string
  /** base64 AES-GCM ciphertext of the DER PKCS8 private key. */
  encryptedPrivateKey: string
  /** "ivHex:authTagHex" needed to decrypt encryptedPrivateKey. */
  privateKeyIv: string
}

/**
 * Server secret used to wrap issuer private keys. Required only when an issuer
 * key operation runs, so the app can still boot without it for non-issuer use.
 */
function getIssuerKeySecret(): Buffer {
  const raw = process.env.ISSUER_KEY_SECRET
  if (!raw) {
    throw new Error('ISSUER_KEY_SECRET is not set — required for issuer credential signing')
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('ISSUER_KEY_SECRET must be a base64-encoded 32-byte (256-bit) key')
  }
  return key
}

function encryptPrivateKey(pkcs8Der: Buffer): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getIssuerKeySecret(), iv)
  const encrypted = Buffer.concat([cipher.update(pkcs8Der), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    ciphertext: encrypted.toString('base64'),
    iv: `${iv.toString('hex')}:${authTag.toString('hex')}`,
  }
}

function decryptPrivateKey(ciphertextB64: string, ivField: string): crypto.KeyObject {
  const [ivHex, authTagHex] = ivField.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, getIssuerKeySecret(), iv)
  decipher.setAuthTag(authTag)
  const pkcs8Der = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ])
  return crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' })
}

/**
 * Generate a fresh Ed25519 issuer keypair. The private key is returned only in
 * AES-GCM-encrypted form; plaintext never leaves this function.
 */
export function generateIssuerKey(): GeneratedIssuerKey {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' })
  const pkcs8Der = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer
  const { ciphertext, iv } = encryptPrivateKey(pkcs8Der)

  return {
    keyId: `key_${crypto.randomBytes(8).toString('hex')}`,
    publicKey: Buffer.from(spkiDer).toString('base64'),
    encryptedPrivateKey: ciphertext,
    privateKeyIv: iv,
  }
}

/**
 * Sign a credential payload with a stored (encrypted) issuer private key.
 * Returns a base64url Ed25519 signature over the canonicalized payload.
 */
export function signWithPrivateKey(
  encryptedPrivateKey: string,
  privateKeyIv: string,
  payload: unknown
): string {
  const privateKey = decryptPrivateKey(encryptedPrivateKey, privateKeyIv)
  const signature = crypto.sign(null, canonicalBytes(payload), privateKey)
  return signature.toString('base64url')
}
