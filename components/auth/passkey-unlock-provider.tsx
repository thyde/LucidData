'use client'

import { createContext, useContext, type ReactNode } from 'react'

const PasskeyUnlockContext = createContext(false)

/**
 * LD-112: whether any of the person's passkeys can open the vault. The
 * dashboard layout reads it with the page, so a locked page knows without a
 * server action of its own.
 */
export function PasskeyUnlockProvider({ available, children }: { available: boolean; children: ReactNode }) {
  return <PasskeyUnlockContext.Provider value={available}>{children}</PasskeyUnlockContext.Provider>
}

export function usePasskeyUnlockAvailable(): boolean {
  return useContext(PasskeyUnlockContext)
}
