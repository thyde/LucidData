// Runtime-neutral access to the primitives the vault crypto depends on.
//
// The vault has to open wherever the user is. Today that is a browser; LD-204
// puts the same vault in a React Native app. Those runtimes disagree about
// which globals exist, and the disagreement is not small:
//
//   Browsers   crypto.subtle, crypto.getRandomValues, btoa, atob
//   Node 18+   crypto.subtle and crypto.getRandomValues, no btoa or atob
//   Hermes     none of them
//
// Hermes is the engine React Native uses, so a module that reaches for btoa
// works in the browser, fails in Node, and fails differently on a phone. This
// module is the one place those differences are resolved, which means porting
// to a new runtime is a question of what to polyfill here rather than an audit
// of every call site.
//
// No key material is created, derived, or held here. This module only locates
// the implementation that key-derivation.ts and client-crypto.ts use, and
// converts between bytes and the base64 the vault stores.

/**
 * The host's Web Crypto implementation.
 *
 * Resolved on each call rather than captured at module load, because a React
 * Native app installs its polyfill during startup and the module graph may be
 * evaluated first.
 */
function getCrypto(): Crypto {
  const host = globalThis.crypto
  if (host?.subtle && typeof host.getRandomValues === 'function') return host

  // Deliberately actionable: this is the first thing that breaks when the vault
  // is taken to a new runtime, and the fix is not obvious from a TypeError on
  // an undefined property.
  throw new Error(
    'Web Crypto is not available in this runtime. Browsers and Node 18+ provide it as ' +
      'globalThis.crypto. React Native does not, so a native Web Crypto implementation must ' +
      'be assigned to globalThis.crypto during startup, before any vault operation runs.'
  )
}

/** The host's SubtleCrypto. Throws with guidance if the runtime has none. */
export function getSubtle(): SubtleCrypto {
  return getCrypto().subtle
}

/**
 * Cryptographically secure random bytes.
 *
 * Every IV and salt in the vault comes from here. A runtime that silently
 * substituted Math.random would produce reused IVs, which breaks AES-GCM
 * outright, so this deliberately has no fallback.
 *
 * The buffer generic is pinned to ArrayBuffer rather than left as the default
 * ArrayBufferLike so the result is accepted as a BufferSource by the Web Crypto
 * signatures, which exclude SharedArrayBuffer.
 */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return getCrypto().getRandomValues(new Uint8Array(length))
}

/** UTF-8 encode. Routed through this module so there is a single polyfill point. */
export function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text)
}

/** UTF-8 decode. Routed through this module so there is a single polyfill point. */
export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const BASE64_LOOKUP = /* @__PURE__ */ (() => {
  const table = new Int8Array(256).fill(-1)
  for (let i = 0; i < BASE64_ALPHABET.length; i++) table[BASE64_ALPHABET.charCodeAt(i)] = i
  return table
})()

/**
 * Encode bytes as standard base64 with padding.
 *
 * Implemented here rather than via btoa because Hermes has no btoa, and because
 * the usual btoa workaround of building a binary string one character at a time
 * overflows the call stack on large inputs when written with String.fromCharCode
 * and a spread.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined

    out += BASE64_ALPHABET[b0 >> 2]
    out += BASE64_ALPHABET[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0b111111]
  }
  return out
}

/**
 * Decode standard base64 to bytes.
 *
 * Rejects characters outside the alphabet rather than skipping them, matching
 * atob. Silently ignoring them would turn a corrupted ciphertext into a
 * shorter valid-looking one instead of a clear failure.
 */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const body = base64.endsWith('=') ? base64.replace(/=+$/, '') : base64
  const out = new Uint8Array((body.length * 3) >> 2)

  let written = 0
  let buffer = 0
  let bits = 0

  for (let i = 0; i < body.length; i++) {
    const value = BASE64_LOOKUP[body.charCodeAt(i) & 0xff]
    if (value < 0) throw new Error('Invalid base64 input')

    buffer = (buffer << 6) | value
    bits += 6

    if (bits >= 8) {
      bits -= 8
      out[written++] = (buffer >> bits) & 0xff
    }
  }

  return out
}
