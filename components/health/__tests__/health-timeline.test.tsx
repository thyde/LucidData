import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, within } from '@/test/helpers/render'
import { createLoadingQuery, createMockQuery } from '@/test/utils'
import { HealthTimeline } from '../health-timeline'
import { pointsFor } from '../metric-card'
import type { DecryptedVaultData } from '@/types'

vi.mock('@/lib/hooks/useVault', () => ({
  useVaultList: vi.fn(),
  VAULT_KEYS: { all: ['vault'] },
}))

vi.mock('@/lib/context/encryption-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/context/encryption-context')>()
  return { ...actual, useEncryption: vi.fn(() => ({ isLocked: false })) }
})

vi.mock('@/lib/actions/metrics.actions', () => ({
  recordTimelineVisitAction: vi.fn(() => Promise.resolve()),
}))

import { useVaultList } from '@/lib/hooks/useVault'
import { useEncryption } from '@/lib/context/encryption-context'
import { recordTimelineVisitAction } from '@/lib/actions/metrics.actions'

let id = 0
function entry(provider: string | null, schemaType: string, data: Record<string, unknown>): DecryptedVaultData {
  id += 1
  return {
    id: `entry-${id}`,
    user_id: 'user-1',
    label: schemaType,
    description: null,
    category: 'health',
    data,
    tags: [],
    schema_type: schemaType,
    source_provider: provider,
    source_record_id: provider ? `${schemaType}:${id}` : null,
    source_captured_at: null,
    expires_at: null,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  } as unknown as DecryptedVaultData
}

const ENTRIES = [
  entry('garmin', 'fitness_daily', { date: '2026-09-14', steps: 9400 }),
  entry('apple-health', 'fitness_daily', { date: '2026-09-14', steps: 9000 }),
  entry('apple-health', 'fitness_daily', { date: '2026-09-15', steps: 7000 }),
  entry('garmin', 'vitals_daily', { date: '2026-09-19', resting_heart_rate: 54 }),
  // Older than any range but All.
  entry(null, 'body_measurement', { date: '2025-01-10', weight_kg: 72 }),
  // Not health, and not charted.
  entry(null, 'custom', { note: 'keys under the mat' }),
]

function showVault(entries: DecryptedVaultData[]) {
  vi.mocked(useVaultList).mockReturnValue(createMockQuery(entries) as unknown as ReturnType<typeof useVaultList>)
}

// Node 25 defines its own localStorage, without methods unless given a file,
// and it hides jsdom's. A small one in memory behaves the same everywhere.
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 20, 12, 0, 0))
  vi.mocked(useEncryption).mockReturnValue({ isLocked: false } as ReturnType<typeof useEncryption>)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('HealthTimeline', () => {
  it('charts each metric with its latest value and where it came from', () => {
    showVault(ENTRIES)
    render(<HealthTimeline />)

    expect(screen.getByRole('heading', { level: 1, name: 'Health' })).toBeInTheDocument()
    const steps = screen.getByTestId('metric-steps')
    expect(within(steps).getByTestId('metric-latest')).toHaveTextContent('7,000 steps')
    expect(steps).toHaveTextContent('Sep 15, 2026, from Apple Health')
    expect(within(screen.getByTestId('metric-resting_heart_rate')).getByTestId('metric-latest')).toHaveTextContent('54 bpm')
    // Weight was last recorded long before the last 30 days.
    expect(screen.queryByTestId('metric-weight_kg')).not.toBeInTheDocument()
  })

  it('lists the numbers with every source, and says which were not added', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    showVault(ENTRIES)
    render(<HealthTimeline />)

    const steps = screen.getByTestId('metric-steps')
    await user.click(within(steps).getByText('Show the numbers'))
    const rows = within(within(steps).getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      'Sep 15, 20267,000 stepsApple Health',
      'Sep 14, 20269,400 stepsGarmin (also in Apple Health, not added)',
    ])
  })

  it('widens the range on request', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    showVault(ENTRIES)
    render(<HealthTimeline />)

    const all = screen.getByRole('button', { name: 'All' })
    expect(all).toHaveAttribute('aria-pressed', 'false')
    await user.click(all)
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(screen.getByTestId('metric-weight_kg')).getByTestId('metric-latest')).toHaveTextContent('72 kg')
  })

  it('says when the range is empty but the vault is not', () => {
    showVault([entry(null, 'body_measurement', { date: '2025-01-10', weight_kg: 72 })])
    render(<HealthTimeline />)

    expect(screen.getByTestId('health-empty-range')).toHaveTextContent('Your most recent health record is from Jan 10, 2025.')
  })

  it('points an empty vault at the importer', () => {
    showVault([entry(null, 'custom', { note: 'keys under the mat' })])
    render(<HealthTimeline />)

    expect(screen.getByRole('heading', { name: 'No health records yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your vault' })).toHaveAttribute('href', '/vault')
  })

  it('shows placeholders while the vault loads', () => {
    vi.mocked(useVaultList).mockReturnValue(createLoadingQuery() as unknown as ReturnType<typeof useVaultList>)
    render(<HealthTimeline />)

    expect(screen.getByTestId('health-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('health-empty')).not.toBeInTheDocument()
  })

  it('asks a locked vault to sign in and come back, and counts nothing', () => {
    vi.mocked(useEncryption).mockReturnValue({ isLocked: true } as ReturnType<typeof useEncryption>)
    showVault([])
    render(<HealthTimeline />)

    expect(screen.getByRole('heading', { level: 1, name: 'Your vault is locked' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?redirectedFrom=%2Fhealth')
    expect(recordTimelineVisitAction).not.toHaveBeenCalled()
  })

  it('counts the first visit of the day once, and nothing about it', () => {
    showVault(ENTRIES)
    const first = render(<HealthTimeline />)
    first.unmount()
    render(<HealthTimeline />)

    expect(recordTimelineVisitAction).toHaveBeenCalledTimes(1)
    expect(recordTimelineVisitAction).toHaveBeenCalledWith()

    // The next day counts again.
    vi.setSystemTime(new Date(2026, 8, 21, 9, 0, 0))
    render(<HealthTimeline />)
    expect(recordTimelineVisitAction).toHaveBeenCalledTimes(2)
  })
})

describe('pointsFor', () => {
  const day = (date: string, value: number) => ({ date, value, source: 'garmin', sources: ['garmin'] })

  it('gives every day in a range a point, null where nothing was recorded', () => {
    expect(pointsFor([day('2026-09-02', 5)], '2026-09-01', '2026-09-03').map((point) => point.value)).toEqual([null, 5, null])
  })

  it('adds up a week of workouts rather than averaging the days that had one', () => {
    const points = pointsFor([day('2026-01-05', 30), day('2026-01-07', 45)], '2025-01-01', '2026-01-14', true)
    expect(points.find((point) => point.date === '2026-01-05')?.value).toBe(75)
  })

  it('averages by the week, from Monday, once a range passes a year', () => {
    // 2026-01-05 is a Monday.
    const points = pointsFor([day('2026-01-05', 4), day('2026-01-11', 6), day('2026-01-12', 9)], '2025-01-01', '2026-01-14')
    expect(points[0].date).toBe('2024-12-30')
    const january = points.filter((point) => point.date >= '2026-01-05')
    expect(january.map((point) => [point.date, point.value])).toEqual([
      ['2026-01-05', 5],
      ['2026-01-12', 9],
    ])
    expect(points.filter((point) => point.value === null).length).toBe(points.length - 2)
  })
})
