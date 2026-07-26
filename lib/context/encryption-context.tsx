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
import { deriveMasterKey } from '@/lib/crypto/key-derivation'
import { encryptVaultEntry, decryptVaultEntry, type EncryptedEntry } from '@/lib/crypto/client-crypto'

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
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null)

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const idleLockMinutes = useSyncExternalStore(
    subscribeToIdleLock,
    readIdleLockMinutes,
    () => DEFAULT_IDLE_LOCK_MINUTES
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const unlock = useCallback(async (password: string, keySalt: string) => {
    const key = await deriveMasterKey(password, keySalt)
    setMasterKey(key)
  }, [])

  // Dropping the reference is what makes the key unreachable: it is a
  // non-extractable CryptoKey, so nothing else in the page retains it.
  const lock = useCallback(() => setMasterKey(null), [])

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
  }, [masterKey, idleLockMinutes])

  const encrypt = useCallback(async (plaintext: string): Promise<EncryptedEntry> => {
    if (!masterKey) throw new Error('Vault is locked')
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
    }),
    [masterKey, idleLockMinutes, setIdleLockMinutes, unlock, lock, encrypt, decrypt]
  )

  return <EncryptionContext.Provider value={value}>{children}</EncryptionContext.Provider>
}

export function useEncryption(): EncryptionContextValue {
  const ctx = useContext(EncryptionContext)
  if (!ctx) throw new Error('useEncryption must be used within EncryptionProvider')
  return ctx
}
