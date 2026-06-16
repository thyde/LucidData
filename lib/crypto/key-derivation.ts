// Browser-only: derives a CryptoKey from password + salt using PBKDF2

export async function deriveMasterKey(password: string, saltB64: string): Promise<CryptoKey> {
  const saltBytes = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export function generateKeySalt(): string {
  const saltBytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (let i = 0; i < saltBytes.byteLength; i++) binary += String.fromCharCode(saltBytes[i])
  return btoa(binary)
}
