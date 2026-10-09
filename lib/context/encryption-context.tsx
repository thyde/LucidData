'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { deriveMasterKey } from '@luciddata/core/crypto/key-derivation'
import { encryptVaultEntry, decryptVaultEntry, type EncryptedEntry } from '@luciddata/core/crypto/client-crypto'

/**
 * LD-106: idle locking.
 *
 * The master key lives only in memory, but until now it stayed there for as long
 * as the tab was open, so anyone with access to an unlocked device had the whole
 * vault. The idle timer clears the key itself rather than flipping a flag, so a
 * stale tab cannot decrypt anything.
 */
export const IDLE_LOCK_STORAGE_KEY = 'luciddata.idleLockMinutes'
export const DEFAULT_IDLE_LOCK_MINUTES = 15
export const IDLE_LOCK_OPTIONS = [5, 15, 30, 60] as const

export function readIdleLockMinutes(): number {
  // localStorage can be absent or restricted (private browsing, embedded
  // contexts, test environments). Falling back to the default keeps the vault
  // locking rather than failing to render.
  try {
    const stored = window?.localStorage?.getItem(IDLE_LOCK_STORAGE_KEY)
    if (stored === null || stored === undefined) return DEFAULT_IDLE_LOCK_MINUTES
    const parsed = Number(stored)
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_IDLE_LOCK_MINUTES
    return parsed
  } catch {
    return DEFAULT_IDLE_LOCK_MINUTES
  }
}

// The preference lives in localStorage, which is an external store. Reading it
// through useSyncExternalStore keeps server and client renders consistent
// without a setState-in-effect round trip.
const IDLE_LOCK_EVENT = 'luciddata:idle-lock-changed'

function subscribeToIdleLock(onChange: () => void): () => void {
  window.addEventListener(IDLE_LOCK_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(IDLE_LOCK_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function writeIdleLockMinutes(minutes: number): void {
  try {
    window.localStorage.setItem(IDLE_LOCK_STORAGE_KEY, String(minutes))
  } catch {
    // Preference cannot be persisted here. The session still uses the value.
  }
  window.dispatchEvent(new Event(IDLE_LOCK_EVENT))
}

/** What `encrypt` says while a password change is moving the vault to a new key. */
export const WRITES_HELD_MESSAGE = 'Your vault is being re-encrypted. Try again when that finishes.'

interface EncryptionContextValue {
  masterKey: CryptoKey | null
  isLocked: boolean
  /** Minutes of inactivity before the key is cleared. 0 means never. */
  idleLockMinutes: number
  setIdleLockMinutes: (minutes: number) => void
  unlock: (password: string, keySalt: string) => Promise<void>
  lock: () => void
  encrypt: (plaintext: string) => Promise<EncryptedEntry>
  decrypt: (client_ciphertext: string, encrypted_dek: string, dek_salt: string) => Promise<string>
  /**
   * Refuse new encryption until the returned release is called. A password
   * change holds writes while it moves every entry to the new key, so nothing
   * this tab saves meanwhile lands under the old one.
   */
  holdWrites: () => () => void
  /** Whether a key change is holding writes. */
  writesHeld: () => boolean
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null)

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const [masterKey, setKeyState] = useState<CryptoKey | null>(null)
  // The key in force right now. A callback made with an earlier key compares
  // against it, so a write already under way when the key changed is refused
  // rather than saved under a key the vault no longer uses.
  const currentKey = useRef<CryptoKey | null>(null)
  const holds = useRef(0)
  const setMasterKey = useCallback((key: CryptoKey | null) => {
    currentKey.current = key
    setKeyState(key)
  }, [])
  const idleLockMinutes = useSyncExternalStore(
    subscribeToIdleLock,
    readIdleLockMinutes,
    () => DEFAULT_IDLE_LOCK_MINUTES
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const unlock = useCallback(async (password: string, keySalt: string) => {
    const key = await deriveMasterKey(password, keySalt)
    setMasterKey(key)
  }, [setMasterKey])

  // Dropping the reference is what makes the key unreachable: it is a
  // non-extractable CryptoKey, so nothing else in the page retains it.
  const lock = useCallback(() => setMasterKey(null), [setMasterKey])

  const holdWrites = useCallback(() => {
    holds.current += 1
    let released = false
    return () => {
      if (released) return
      released = true
      holds.current -= 1
    }
  }, [])

  const writesHeld = useCallback(() => holds.current > 0, [])

  const setIdleLockMinutes = useCallback((minutes: number) => {
    writeIdleLockMinutes(minutes)
  }, [])

  // Arm the idle timer only while unlocked, and reset it on real interaction.
  useEffect(() => {
    if (!masterKey || idleLockMinutes <= 0) return

    const timeoutMs = idleLockMinutes * 60 * 1000
    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setMasterKey(null), timeoutMs)
    }

    arm()
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, arm, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, arm)
      }
    }
  }, [masterKey, idleLockMinutes, setMasterKey])

  const encrypt = useCallback(async (plaintext: string): Promise<EncryptedEntry> => {
    if (!masterKey) throw new Error('Vault is locked')
    if (masterKey !== currentKey.current) throw new Error('Your vault key changed. Try again.')
    if (holds.current > 0) throw new Error(WRITES_HELD_MESSAGE)
    return encryptVaultEntry(masterKey, plaintext)
  }, [masterKey])

  const decrypt = useCallback(async (
    client_ciphertext: string,
    encrypted_dek: string,
    dek_salt: string
  ): Promise<string> => {
    if (!masterKey) throw new Error('Vault is locked')
    return decryptVaultEntry(masterKey, client_ciphertext, encrypted_dek, dek_salt)
  }, [masterKey])

  const value = useMemo(
    () => ({
      masterKey,
      isLocked: masterKey === null,
      idleLockMinutes,
      setIdleLockMinutes,
      unlock,
      lock,
      encrypt,
      decrypt,
      holdWrites,
      writesHeld,
    }),
    [masterKey, idleLockMinutes, setIdleLockMinutes, unlock, lock, encrypt, decrypt, holdWrites, writesHeld]
  )

  return <EncryptionContext.Provider value={value}>{children}</EncryptionContext.Provider>
}

export function useEncryption(): EncryptionContextValue {
  const ctx = useContext(EncryptionContext)
  if (!ctx) throw new Error('useEncryption must be used within EncryptionProvider')
  return ctx
}
