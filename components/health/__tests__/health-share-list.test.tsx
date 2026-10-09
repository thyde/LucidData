import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, within } from '@/test/helpers/render'
import { HealthShareList, shareStatus, shareStatusText } from '../health-share-list'
import type { HealthShareSummary } from '@/lib/services/health-share.service'

const mocks = vi.hoisted(() => ({
  createHealthShareAction: vi.fn(),
  listHealthSharesAction: vi.fn(),
  revokeHealthShareAction: vi.fn(),
}))
vi.mock('@/lib/actions/health-share.actions', () => mocks)

const FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString()
const PAST = new Date(Date.now() - 2 * 86_400_000).toISOString()

function share(overrides: Partial<HealthShareSummary>): HealthShareSummary {
  return {
    id: 'share-1',
    consent_id: 'consent-1',
    metrics: ['steps', 'sleep_hours'],
    range_start: '2026-09-01',
    range_end: '2026-09-30',
    expires_at: FUTURE,
    revoked_at: null,
    view_count: 0,
    last_viewed_at: null,
    created_at: PAST,
    label: 'Dr. Patel',
    ...overrides,
  }
}

const SHARES = [
  share({ id: 'open-1' }),
  share({ id: 'expired-1', label: 'Coach', expires_at: PAST, view_count: 1, last_viewed_at: PAST }),
  share({ id: 'revoked-1', label: 'Anyone with the link', revoked_at: PAST, view_count: 3, last_viewed_at: PAST }),
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listHealthSharesAction.mockResolvedValue(SHARES)
  mocks.revokeHealthShareAction.mockResolvedValue({ ...SHARES[0], revoked_at: new Date().toISOString() })
})

describe('HealthShareList', () => {
  it('lists every share with its terms and where it stands', async () => {
    render(<HealthShareList />)
    const items = await screen.findAllByTestId('health-share')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Dr. Patel')
    expect(items[0]).toHaveTextContent('Steps and Sleep, Sep 1, 2026 to Sep 30, 2026')
    expect(items[0]).toHaveTextContent(/Open until .*, not opened\./)
    expect(items[1]).toHaveTextContent(/Expired on .*, opened once, most recently on/)
    expect(items[2]).toHaveTextContent(/Revoked on .*, opened 3 times/)
    expect(within(items[1]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(items[2]).queryByRole('button')).not.toBeInTheDocument()
  })

  it('revokes an open share after asking', async () => {
    const user = userEvent.setup()
    render(<HealthShareList />)
    const [first] = await screen.findAllByTestId('health-share')
    await user.click(within(first).getByRole('button', { name: 'Revoke the link for Dr. Patel' }))
    expect(screen.getByRole('alertdialog', { name: 'Revoke this link?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(mocks.revokeHealthShareAction).toHaveBeenCalledWith({ shareId: 'open-1' })
  })

  it('keeps a share when the person changes their mind', async () => {
    const user = userEvent.setup()
    render(<HealthShareList />)
    const [first] = await screen.findAllByTestId('health-share')
    await user.click(within(first).getByRole('button', { name: /Revoke/ }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(mocks.revokeHealthShareAction).not.toHaveBeenCalled()
  })

  it('shows nothing when there are no shares', async () => {
    mocks.listHealthSharesAction.mockResolvedValue([])
    const { container } = render(<HealthShareList />)
    await vi.waitFor(() => expect(mocks.listHealthSharesAction).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('share status', () => {
  const now = Date.parse('2026-10-01T12:00:00Z')

  it('is revoked, expired, or open, in that order', () => {
    expect(shareStatus({ revoked_at: '2026-09-30T00:00:00Z', expires_at: '2026-09-01T00:00:00Z' }, now)).toBe('revoked')
    expect(shareStatus({ revoked_at: null, expires_at: '2026-10-01T12:00:00Z' }, now)).toBe('expired')
    expect(shareStatus({ revoked_at: null, expires_at: '2026-10-01T12:00:01Z' }, now)).toBe('open')
  })

  it('reads as one sentence', () => {
    expect(shareStatusText(share({ expires_at: '2026-10-08T12:00:00Z' }), now)).toBe('Open until Oct 8, 2026, not opened.')
  })
})
