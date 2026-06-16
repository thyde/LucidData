import { randomBytes, createHash } from 'crypto'

export function generateApiKey(): { key: string; hash: string } {
  const raw = randomBytes(32)
  const key = `lk_live_${raw.toString('base64url')}`
  const hash = createHash('sha256').update(key).digest('hex')
  return { key, hash }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}
