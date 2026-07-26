/**
 * LD-201 provider token storage.
 *
 * This is the one place in the product where the server holds a key that opens
 * something. A sync worker has to call Strava or Fitbit while the person is
 * away, so it needs their OAuth tokens, and no amount of browser-side
 * encryption changes that.
 *
 * It is a deliberate, disclosed exception rather than a quiet one. Provider
 * tokens are not vault data: they let us read a provider's copy of a record,
 * not the person's vault. The trust centre says so in those words, and the
 * wrapping follows the same AES-256-GCM pattern issuer keys already use.
 *
 * Server only.
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

export interface WrappedToken {
  /** base64 ciphertext. */
  ciphertext: string
  /** "ivHex:authTagHex". */
  iv: string
}

/**
 * The wrapping secret. Read at call time rather than at import, so the
 * application still boots without connectors configured.
 */
function getConnectorSecret(): Buffer {
  const raw = process.env.CONNECTOR_TOKEN_SECRET
  if (!raw) {
    throw new Error(
      'CONNECTOR_TOKEN_SECRET is not set. It is required to store provider tokens.'
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('CONNECTOR_TOKEN_SECRET must be a base64-encoded 32-byte key')
  }
  return key
}

export function isConnectorStorageConfigured(): boolean {
  try {
    getConnectorSecret()
    return true
  } catch {
    return false
  }
}

export function wrapToken(token: string): WrappedToken {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getConnectorSecret(), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    ciphertext: encrypted.toString('base64'),
    iv: `${iv.toString('hex')}:${authTag.toString('hex')}`,
  }
}

export function unwrapToken(wrapped: WrappedToken): string {
  const [ivHex, authTagHex] = wrapped.iv.split(':')
  if (!ivHex || !authTagHex) throw new Error('Malformed token wrapping')

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getConnectorSecret(),
    Buffer.from(ivHex, 'hex')
  )
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(wrapped.ciphertext, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/**
 * Sign the OAuth state so a callback cannot be forged or replayed.
 *
 * The state binds the provider, the person, and a nonce, and carries an
 * expiry. Without this, an attacker who can make the person's browser hit our
 * callback can attach their own provider account to that person's vault.
 */
export interface OAuthState {
  userId: string
  provider: string
  nonce: string
  expiresAt: number
}

const STATE_TTL_MS = 10 * 60 * 1000

export function signState(state: Omit<OAuthState, 'nonce' | 'expiresAt'>): string {
  const payload: OAuthState = {
    ...state,
    nonce: crypto.randomBytes(16).toString('base64url'),
    expiresAt: Date.now() + STATE_TTL_MS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', getConnectorSecret())
    .update(body)
    .digest('base64url')
  return `${body}.${signature}`
}

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OAuthStateError'
  }
}

export function verifyState(raw: string, now: number = Date.now()): OAuthState {
  const [body, signature] = raw.split('.')
  if (!body || !signature) throw new OAuthStateError('Malformed state')

  const expected = crypto
    .createHmac('sha256', getConnectorSecret())
    .update(body)
    .digest('base64url')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new OAuthStateError('State signature does not verify')
  }

  let payload: OAuthState
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    throw new OAuthStateError('Malformed state')
  }

  if (!payload.userId || !payload.provider) throw new OAuthStateError('Incomplete state')
  if (payload.expiresAt <= now) throw new OAuthStateError('State has expired')
  return payload
}
