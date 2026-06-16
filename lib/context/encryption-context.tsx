'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { deriveMasterKey } from '@/lib/crypto/key-derivation'
import { encryptVaultEntry, decryptVaultEntry, type EncryptedEntry } from '@/lib/crypto/client-crypto'

interface EncryptionContextValue {
  masterKey: CryptoKey | null
  isLocked: boolean
  unlock: (password: string, keySalt: string) => Promise<void>
  lock: () => void
  encrypt: (plaintext: string) => Promise<EncryptedEntry>
  decrypt: (client_ciphertext: string, encrypted_dek: string, dek_salt: string) => Promise<string>
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null)

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)

  const unlock = useCallback(async (password: string, keySalt: string) => {
    const key = await deriveMasterKey(password, keySalt)
    setMasterKey(key)
  }, [])

  const lock = useCallback(() => setMasterKey(null), [])

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

  return (
    <EncryptionContext.Provider value={{
      masterKey,
      isLocked: masterKey === null,
      unlock,
      lock,
      encrypt,
      decrypt,
    }}>
      {children}
    </EncryptionContext.Provider>
  )
}

export function useEncryption(): EncryptionContextValue {
  const ctx = useContext(EncryptionContext)
  if (!ctx) throw new Error('useEncryption must be used within EncryptionProvider')
  return ctx
}
