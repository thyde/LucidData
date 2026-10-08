import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isActionFailure } from '@/lib/actions/action-result'

const getUser = vi.fn()
const createVaultData = vi.fn()
const updateVaultData = vi.fn()
const deleteVaultData = vi.fn()
const getVaultDataById = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))
vi.mock('@/lib/services/vault.service', () => ({
  createVaultData: (...args: unknown[]) => createVaultData(...args),
  updateVaultData: (...args: unknown[]) => updateVaultData(...args),
  deleteVaultData: (...args: unknown[]) => deleteVaultData(...args),
  getVaultDataById: (...args: unknown[]) => getVaultDataById(...args),
  getUserVaultData: vi.fn(),
}))

const { createVaultEntryAction, deleteVaultEntryAction, getVaultEntryAction, updateVaultEntryAction } =
  await import('@/lib/actions/vault.actions')

const ID = '2f1c8a3e-6b1d-4c2a-9f0e-1a2b3c4d5e6f'
const envelope = { client_ciphertext: 'c', encrypted_dek: 'd', dek_salt: 's' }

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  createVaultData.mockResolvedValue({ id: ID })
  updateVaultData.mockResolvedValue({ id: ID })
})

describe('createVaultEntryAction', () => {
  it('passes only the fields an entry can have, for the session user', async () => {
    await createVaultEntryAction({
      label: 'Morning vitals',
      category: 'health',
      schema_type: 'vitals_daily',
      ...envelope,
      // Not part of the action's type, but anyone can post to an action.
      ...({ user_id: 'user-2', id: ID } as object),
    })

    expect(createVaultData).toHaveBeenCalledWith('user-1', {
      label: 'Morning vitals',
      category: 'health',
      schema_type: 'vitals_daily',
      tags: [],
      ...envelope,
    })
  })

  it('refuses an entry without its encrypted envelope, and says which field', async () => {
    const result = await createVaultEntryAction({
      label: 'Plain',
      client_ciphertext: 'c',
      encrypted_dek: '',
      dek_salt: 's',
    })

    expect(isActionFailure(result) && result.code).toBe('invalid_input')
    expect(isActionFailure(result) && result.message).toContain('encrypted_dek')
    expect(createVaultData).not.toHaveBeenCalled()
  })

  it('accepts the copy of a claimed credential and refuses a type the registry does not know', async () => {
    await createVaultEntryAction({ label: 'Degree', category: 'credentials', schema_type: 'verifiable_credential', ...envelope })
    expect(createVaultData).toHaveBeenCalledTimes(1)

    const result = await createVaultEntryAction({ label: 'x', schema_type: 'MedicalRecord', ...envelope })
    expect(isActionFailure(result) && result.code).toBe('invalid_input')
    expect(createVaultData).toHaveBeenCalledTimes(1)
  })

  it('refuses a caller without a session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(createVaultEntryAction({ label: 'x', ...envelope })).rejects.toThrow('Unauthorized')
    expect(createVaultData).not.toHaveBeenCalled()
  })
})

describe('updateVaultEntryAction', () => {
  it('drops fields an edit cannot change', async () => {
    await updateVaultEntryAction(ID, {
      label: 'Renamed',
      ...({ schema_type: 'custom', user_id: 'user-2' } as object),
    })

    expect(updateVaultData).toHaveBeenCalledWith(ID, 'user-1', { label: 'Renamed' })
  })

  it('refuses new ciphertext without its wrapped key', async () => {
    const result = await updateVaultEntryAction(ID, { client_ciphertext: 'c' })

    expect(isActionFailure(result) && result.code).toBe('invalid_input')
    expect(updateVaultData).not.toHaveBeenCalled()
  })

  it('answers not found for an id that cannot name an entry', async () => {
    const result = await updateVaultEntryAction('vault-1', { label: 'x' })

    expect(isActionFailure(result) && result.code).toBe('not_found')
    expect(updateVaultData).not.toHaveBeenCalled()
  })
})

describe('reading and deleting by id', () => {
  it('reads nothing for an id that cannot name an entry', async () => {
    await expect(getVaultEntryAction("1' OR '1'='1")).resolves.toBeNull()
    expect(getVaultDataById).not.toHaveBeenCalled()
  })

  it('deletes nothing for an id that cannot name an entry', async () => {
    const result = await deleteVaultEntryAction('../other')

    expect(isActionFailure(result) && result.code).toBe('not_found')
    expect(deleteVaultData).not.toHaveBeenCalled()
  })

  it('deletes by a well-formed id for the session user', async () => {
    await deleteVaultEntryAction(ID)
    expect(deleteVaultData).toHaveBeenCalledWith(ID, 'user-1')
  })
})
