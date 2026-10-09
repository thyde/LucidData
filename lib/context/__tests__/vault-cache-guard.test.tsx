import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { EncryptionProvider, useEncryption } from '@/lib/context/encryption-context'
import { VaultCacheGuard } from '@/lib/context/vault-cache-guard'

const SALT = 'c2FsdC1mb3ItdGhlLXZhdWx0LWNhY2hlLWd1YXJkLXRlc3Q'

describe('VaultCacheGuard', () => {
  it('drops decrypted entries from the cache when the vault locks, and nothing else', async () => {
    const queryClient = new QueryClient()
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <EncryptionProvider>
            <VaultCacheGuard />
            {children}
          </EncryptionProvider>
        </QueryClientProvider>
      )
    }
    const { result } = renderHook(() => useEncryption(), { wrapper })
    await act(() => result.current.unlock('correct horse battery staple', SALT))

    queryClient.setQueryData(['vault', 'list'], [{ id: 'entry-1', data: { steps: 9100 } }])
    queryClient.setQueryData(['vault', 'detail', 'entry-1'], { id: 'entry-1', data: { steps: 9100 } })
    queryClient.setQueryData(['notifications'], [{ id: 'note-1' }])

    act(() => result.current.lock())

    expect(queryClient.getQueryData(['vault', 'list'])).toBeUndefined()
    expect(queryClient.getQueryData(['vault', 'detail', 'entry-1'])).toBeUndefined()
    expect(queryClient.getQueryData(['notifications'])).toEqual([{ id: 'note-1' }])
  }, 30_000)
})
