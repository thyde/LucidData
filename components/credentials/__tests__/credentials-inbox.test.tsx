import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@/test/helpers/render'
import userEvent from '@testing-library/user-event'

const getMyCredentialsAction = vi.fn()
const claimCredentialAction = vi.fn()
const linkCredentialVaultEntryAction = vi.fn()
const createVaultEntryAction = vi.fn()
const toast = vi.fn()

vi.mock('@/lib/actions/credential.actions', () => ({
  getMyCredentialsAction: () => getMyCredentialsAction(),
  claimCredentialAction: (...args: unknown[]) => claimCredentialAction(...args),
  linkCredentialVaultEntryAction: (...args: unknown[]) => linkCredentialVaultEntryAction(...args),
  exportCredentialVcAction: vi.fn(),
}))
vi.mock('@/lib/actions/vault.actions', () => ({
  createVaultEntryAction: (...args: unknown[]) => createVaultEntryAction(...args),
}))
vi.mock('@/lib/context/encryption-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/context/encryption-context')>()),
  useEncryption: () => ({
    isLocked: false,
    encrypt: async () => ({ client_ciphertext: 'c', encrypted_dek: 'd', dek_salt: 's' }),
  }),
}))
vi.mock('@/lib/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('@/components/credentials/share-credential-dialog', () => ({ ShareCredentialDialog: () => null }))

const { CredentialsInbox } = await import('../credentials-inbox')

const LONG_LABEL = `Bachelor of Science in Accessible Systems ${'with first class honours '.repeat(5)}`.trim()

beforeEach(() => {
  vi.clearAllMocks()
  getMyCredentialsAction.mockResolvedValue([
    {
      credential: {
        id: 'cred-1',
        label: LONG_LABEL,
        schema_type: 'education',
        claims: { institution: 'Synthetic University' },
        signed_payload: '{}',
        signature: 'sig',
        key_id: 'key-1',
        issued_at: '2026-10-01T00:00:00Z',
        expires_at: null,
        subject_user_id: null,
        claimed_at: null,
      },
      issuerName: 'Synthetic University',
      issuerVerified: true,
    },
  ])
  claimCredentialAction.mockResolvedValue({ id: 'cred-1' })
  createVaultEntryAction.mockResolvedValue({ id: 'vault-1' })
  linkCredentialVaultEntryAction.mockResolvedValue(undefined)
})

describe('CredentialsInbox', () => {
  it('saves the copy of a credential whose label is longer than a vault label can be', async () => {
    expect(LONG_LABEL.length).toBeGreaterThan(100)
    const user = userEvent.setup()
    render(<CredentialsInbox />)

    await user.click(await screen.findByRole('button', { name: /claim/i }))

    await waitFor(() => expect(linkCredentialVaultEntryAction).toHaveBeenCalledWith('cred-1', 'vault-1'))
    const [entry] = createVaultEntryAction.mock.calls[0] as [{ label: string; schema_type: string }]
    expect(entry.label.length).toBeLessThanOrEqual(100)
    expect(LONG_LABEL.startsWith(entry.label)).toBe(true)
    expect(entry.schema_type).toBe('verifiable_credential')
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Credential claimed' }))
  })
})
