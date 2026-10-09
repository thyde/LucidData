'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEncryption } from '@/lib/context/encryption-context'
import { VAULT_KEYS } from '@/lib/hooks/useVault'

/**
 * Drops every decrypted entry the query cache holds when the vault locks.
 * Locking clears the key, but React Query would otherwise keep the plaintext
 * it already decrypted, and everything worked out from it such as the health
 * timeline, until its cache time ran out.
 */
export function VaultCacheGuard() {
  const { isLocked } = useEncryption()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isLocked) queryClient.removeQueries({ queryKey: VAULT_KEYS.all })
  }, [isLocked, queryClient])

  return null
}
