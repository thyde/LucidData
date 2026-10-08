import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@/test/helpers/render'
import userEvent from '@testing-library/user-event'

const getInsight = vi.fn()
const clearInsight = vi.fn()
const createVaultEntryAction = vi.fn()
const toast = vi.fn()

vi.mock('@/lib/extension/bridge-client', () => ({
  getInsight: () => getInsight(),
  clearInsight: () => clearInsight(),
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

const { TrackerInsight } = await import('../tracker-insight')

const STATE = {
  enabled: true,
  summary: {
    siteCount: 3,
    pagesSeen: 5,
    skipped: 0,
    since: null,
    collectorCount: 0,
    companies: [],
    topCompany: null,
    reach: 0,
  },
  vaultRecord: {
    period_start: '2026-09-01',
    period_end: '2026-10-08',
    sites_visited: 3,
    collectors_seen: 0,
    top_collector: null,
    top_collector_reach: null,
    source: 'lucid-extension',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  getInsight.mockResolvedValue(STATE)
  clearInsight.mockResolvedValue(undefined)
})

describe('TrackerInsight', () => {
  it('keeps the summary in the extension when the vault refuses it', async () => {
    createVaultEntryAction.mockResolvedValue({
      __lucidActionFailure: true,
      message: 'Set up a way to recover your vault before you store anything.',
      code: 'recovery_required',
    })
    const user = userEvent.setup()
    render(<TrackerInsight />)

    await user.click(await screen.findByRole('button', { name: 'Keep this in my vault' }))

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not save it',
          description: 'Set up a way to recover your vault before you store anything.',
          variant: 'destructive',
        })
      )
    )
    expect(clearInsight).not.toHaveBeenCalled()
  })

  it('clears the summary once the vault holds it', async () => {
    createVaultEntryAction.mockResolvedValue({ id: 'vault-1' })
    const user = userEvent.setup()
    render(<TrackerInsight />)

    await user.click(await screen.findByRole('button', { name: 'Keep this in my vault' }))

    await waitFor(() => expect(clearInsight).toHaveBeenCalledTimes(1))
    expect(toast).toHaveBeenCalledWith({ title: 'Saved to your vault' })
  })
})
