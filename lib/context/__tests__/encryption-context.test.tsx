import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { EncryptionProvider, WRITES_HELD_MESSAGE, useEncryption } from '@/lib/context/encryption-context'

const SALT = 'c2FsdC1mb3ItdGhlLWVuY3J5cHRpb24tY29udGV4dC10ZXN0'

function wrapper({ children }: { children: ReactNode }) {
  return <EncryptionProvider>{children}</EncryptionProvider>
}

describe('holding writes during a key change', () => {
  it('refuses to encrypt while held, and again once released', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })
    await act(() => result.current.unlock('correct horse battery staple', SALT))

    let release: () => void = () => undefined
    act(() => {
      release = result.current.holdWrites()
    })
    expect(result.current.writesHeld()).toBe(true)
    await expect(result.current.encrypt('steps 9100')).rejects.toThrow(WRITES_HELD_MESSAGE)

    release()
    // Releasing twice must not let a second hold go early.
    const second = result.current.holdWrites()
    release()
    expect(result.current.writesHeld()).toBe(true)
    second()
    expect(result.current.writesHeld()).toBe(false)

    const sealed = await result.current.encrypt('steps 9100')
    expect(await result.current.decrypt(sealed.client_ciphertext, sealed.encrypted_dek, sealed.dek_salt)).toBe(
      'steps 9100'
    )
  }, 30_000)

  it('refuses a write made with a key the vault no longer uses', async () => {
    const { result } = renderHook(() => useEncryption(), { wrapper })
    await act(() => result.current.unlock('the old password', SALT))
    // A drain that started before the password change keeps this function.
    const staleEncrypt = result.current.encrypt

    await act(() => result.current.unlock('the new password', SALT))

    await expect(staleEncrypt('resting heart rate 58')).rejects.toThrow('Your vault key changed')
    await expect(result.current.encrypt('resting heart rate 58')).resolves.toHaveProperty('client_ciphertext')
  }, 30_000)
})
