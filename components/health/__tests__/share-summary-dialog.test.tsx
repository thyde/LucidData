import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@/test/helpers/render'
import { buildTimeline, type TimelineEntry } from '@luciddata/core/health/timeline'
import { openShare } from '@luciddata/core/crypto/share-link'
import { parseShareSnapshot } from '@luciddata/core/health/share'
import { actionFailure } from '@/lib/actions/action-result'
import { ShareSummaryDialog, rangeProblem } from '../share-summary-dialog'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

const mocks = vi.hoisted(() => ({
  createHealthShareAction: vi.fn(),
  listHealthSharesAction: vi.fn(() => Promise.resolve([])),
  revokeHealthShareAction: vi.fn(),
}))
vi.mock('@/lib/actions/health-share.actions', () => mocks)

const TODAY = '2026-09-30'
const daily = (provider: string | null, date: string, data: Record<string, unknown>): TimelineEntry => ({
  schemaType: 'fitness_daily',
  data: { date, ...data },
  provider,
})
const SERIES = buildTimeline(
  [
    daily('garmin', '2026-09-14', { steps: 9400, resting_heart_rate: 55 }),
    daily('apple-health', '2026-09-15', { steps: 7000 }),
    daily('garmin', '2026-09-29', { steps: 10200 }),
    // Weight from long ago is outside the default range, so it is not offered.
    { schemaType: 'body_measurement', data: { date: '2026-01-10', weight_kg: 72 }, provider: null },
  ],
  { timeZone: 'UTC', to: TODAY }
).filter((item) => item.days.length > 0)

async function openDialog() {
  const user = userEvent.setup()
  render(<ShareSummaryDialog series={SERIES} today={TODAY} />)
  await user.click(screen.getByRole('button', { name: 'Share a summary' }))
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createHealthShareAction.mockResolvedValue({ id: '3f2a0c4e-1b5d-4c6e-8f70-9a1b2c3d4e5f', expiresAt: '2026-10-07T12:00:00.000Z' })
})

describe('ShareSummaryDialog', () => {
  it('offers only the figures recorded in the chosen dates', async () => {
    await openDialog()
    expect(screen.getByRole('checkbox', { name: /Steps \(3 days\)/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Resting heart rate \(1 day\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Weight/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled()
  })

  it('sends the server ciphertext and terms, and keeps the key for the link alone', async () => {
    const user = await openDialog()
    await user.click(screen.getByRole('checkbox', { name: /Steps/ }))
    await user.type(screen.getByLabelText('Who is it for? (optional)'), 'Dr. Patel')
    await user.type(screen.getByLabelText('Your name on the summary (optional)'), 'Alex')
    await user.type(screen.getByLabelText('A note (optional)'), 'Steps since the new knee brace')
    await user.click(screen.getByRole('button', { name: 'Create link' }))

    const link = (await screen.findByTestId('share-link')) as HTMLInputElement
    expect(mocks.createHealthShareAction).toHaveBeenCalledTimes(1)
    const sent = mocks.createHealthShareAction.mock.calls[0][0]
    expect(Object.keys(sent).sort()).toEqual(['ciphertext', 'expiresInDays', 'label', 'metrics', 'rangeEnd', 'rangeStart'])
    expect(sent).toMatchObject({
      metrics: ['steps'],
      rangeStart: '2026-09-01',
      rangeEnd: '2026-09-30',
      expiresInDays: 7,
      label: 'Dr. Patel',
    })

    // The key is after the #, and nothing the server received contains it or the note.
    const [address, key] = link.value.split('#')
    expect(address).toBe(`${window.location.origin}/share/3f2a0c4e-1b5d-4c6e-8f70-9a1b2c3d4e5f`)
    expect(JSON.stringify(sent)).not.toContain(key)
    expect(JSON.stringify(sent)).not.toContain('knee brace')
    expect(JSON.stringify(sent)).not.toContain('Alex')

    // Whoever holds the link reads exactly what was chosen.
    const snapshot = parseShareSnapshot(await openShare(sent.ciphertext, key))
    expect(snapshot).toMatchObject({ from: '2026-09-01', to: '2026-09-30', sharedBy: 'Alex', note: 'Steps since the new knee brace' })
    expect(snapshot.series.map((item) => item.metric)).toEqual(['steps'])
    expect(screen.getByTestId('share-qr')).toBeInTheDocument()
  })

  it('copies the link', async () => {
    const user = await openDialog()
    await user.click(screen.getByRole('checkbox', { name: /Steps/ }))
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    const link = (await screen.findByTestId('share-link')) as HTMLInputElement
    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await navigator.clipboard.readText()).toBe(link.value)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('forgets the link when it closes', async () => {
    const user = await openDialog()
    await user.click(screen.getByRole('checkbox', { name: /Steps/ }))
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    await screen.findByTestId('share-link')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Share a summary' }))
    expect(screen.queryByTestId('share-link')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Steps/ })).not.toBeChecked()
  })

  it('stays open while the link is being made, so the share that results is the one shown', async () => {
    let answer: (value: unknown) => void = () => undefined
    mocks.createHealthShareAction.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const user = await openDialog()
    await user.click(screen.getByRole('checkbox', { name: /Steps/ }))
    await user.click(screen.getByRole('button', { name: 'Create link' }))

    await screen.findByRole('button', { name: 'Encrypting' })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Share a summary' })).toBeInTheDocument()

    answer({ id: '3f2a0c4e-1b5d-4c6e-8f70-9a1b2c3d4e5f', expiresAt: '2026-10-07T12:00:00.000Z' })
    expect(await screen.findByTestId('share-link')).toBeInTheDocument()
    expect(mocks.createHealthShareAction).toHaveBeenCalledTimes(1)
  })

  it('shows a refusal written for the reader', async () => {
    mocks.createHealthShareAction.mockResolvedValue(
      actionFailure('You have 10 shared summaries open. Revoke one before you share another.', 'too_many_shares')
    )
    const user = await openDialog()
    await user.click(screen.getByRole('checkbox', { name: /Steps/ }))
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You have 10 shared summaries open.')
    expect(screen.queryByTestId('share-link')).not.toBeInTheDocument()
  })

  it('hides anything else behind a plain message', async () => {
    mocks.createHealthShareAction.mockRejectedValue(new Error('An error occurred in the Server Components render.'))
    const user = await openDialog()
    await user.click(screen.getByRole('checkbox', { name: /Steps/ }))
    await user.click(screen.getByRole('button', { name: 'Create link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The summary was not shared. Try again.')
  })

  it('takes chosen dates', async () => {
    const user = await openDialog()
    await user.selectOptions(screen.getByLabelText('Dates'), 'custom')
    const from = screen.getByLabelText('From')
    await user.clear(from)
    await user.type(from, '2026-09-15')
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Steps \(2 days\)/ })).toBeInTheDocument())
    expect(screen.queryByRole('checkbox', { name: /Resting heart rate/ })).not.toBeInTheDocument()
  })
})

describe('rangeProblem', () => {
  it('names what is wrong with a range', () => {
    expect(rangeProblem('2026-09-01', '2026-09-30', TODAY)).toBeNull()
    expect(rangeProblem('', '2026-09-30', TODAY)).toBe('Choose both dates.')
    expect(rangeProblem('2026-09-30', '2026-09-01', TODAY)).toBe('The start date must be on or before the end date.')
    expect(rangeProblem('2026-09-01', '2026-10-01', TODAY)).toBe('The end date cannot be after today.')
    expect(rangeProblem('2025-09-01', '2026-09-30', TODAY)).toBe('A share covers a year at most.')
  })
})
