import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@/test/helpers/render'
import { createMockQuery } from '@/test/utils'
import { HealthSummaryCard } from '../health-summary-card'
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

function entry(provider: string | null, schemaType: string, data: Record<string, unknown>): DecryptedVaultData {
  return {
    id: `${schemaType}-${JSON.stringify(data)}`,
    category: 'health',
    data,
    schema_type: schemaType,
    source_provider: provider,
    source_captured_at: null,
  } as unknown as DecryptedVaultData
}

function showVault(entries: DecryptedVaultData[]) {
  vi.mocked(useVaultList).mockReturnValue(createMockQuery(entries) as unknown as ReturnType<typeof useVaultList>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useEncryption).mockReturnValue({ isLocked: false } as ReturnType<typeof useEncryption>)
})

describe('HealthSummaryCard', () => {
  it('leads with steps, sleep, resting heart rate, and workouts, each with its source', () => {
    showVault([
      entry('apple-health', 'body_measurement', { date: '2026-09-15', weight_kg: 72 }),
      entry('apple-health', 'fitness_daily', { date: '2026-09-15', steps: 8412 }),
      entry('garmin', 'vitals_daily', { date: '2026-09-15', resting_heart_rate: 54 }),
    ])
    render(<HealthSummaryCard />)

    const card = screen.getByTestId('health-summary')
    const terms = within(card).getAllByRole('term').map((term) => term.textContent)
    // Weight fills the space the headline figures leave, after them.
    expect(terms).toEqual(['Steps', 'Resting heart rate', 'Weight'])
    expect(card).toHaveTextContent('8,412 steps')
    expect(card).toHaveTextContent('Sep 15, 2026, from Garmin')
    expect(within(card).getByRole('link', { name: 'Open your timeline' })).toHaveAttribute('href', '/health')
    // Seeing the summary is not a visit to the timeline.
    expect(recordTimelineVisitAction).not.toHaveBeenCalled()
  })

  it('offers the importer to a vault with no health records', () => {
    showVault([])
    render(<HealthSummaryCard />)

    expect(screen.getByRole('link', { name: 'Import an export' })).toHaveAttribute('href', '/vault')
  })

  it('asks a locked vault to sign in, and reads nothing', () => {
    vi.mocked(useEncryption).mockReturnValue({ isLocked: true } as ReturnType<typeof useEncryption>)
    showVault([])
    render(<HealthSummaryCard />)

    expect(screen.getByText('Your vault is locked. Sign in again to see your latest figures.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?redirectedFrom=%2Fhealth')
  })
})
