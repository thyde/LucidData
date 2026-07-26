import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/helpers/render'
import { SourceHealth } from '../source-health'
import type { ConnectedSource } from '@/lib/services/connector.service'

const NOW = new Date('2026-07-26T12:00:00.000Z').getTime()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function source(overrides: Partial<ConnectedSource> = {}): ConnectedSource {
  return {
    id: 'source-1',
    provider: 'strava',
    label: 'Strava',
    status: 'connected',
    scopes: ['activity:read'],
    lastSyncedAt: new Date(NOW - HOUR).toISOString(),
    lastError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    recordCount: 42,
    firstCapturedAt: '2026-01-02T00:00:00.000Z',
    lastCapturedAt: '2026-07-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('SourceHealth', () => {
  it('reports a working source with its freshness and coverage', () => {
    render(<SourceHealth source={source()} now={NOW} onDisconnect={vi.fn()} />)

    expect(screen.getByText('Strava')).toBeInTheDocument()
    expect(screen.getByText('Syncing')).toBeInTheDocument()
    expect(screen.getByText('Last synced 1 hour ago')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('does not offer reconnect while a source is working', () => {
    render(<SourceHealth source={source()} now={NOW} onDisconnect={vi.fn()} />)
    expect(screen.queryByRole('link', { name: 'Reconnect' })).not.toBeInTheDocument()
  })

  it('surfaces the provider error and offers reconnect', () => {
    render(
      <SourceHealth
        source={source({
          status: 'error',
          lastError: 'Reconnect this source to continue syncing',
        })}
        now={NOW}
        onDisconnect={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reconnect this source to continue syncing'
    )
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reconnect' })).toHaveAttribute(
      'href',
      '/api/connectors/strava/authorize'
    )
  })

  it('marks a broken source visually distinct from a working one', () => {
    const { rerender } = render(
      <SourceHealth source={source()} now={NOW} onDisconnect={vi.fn()} />
    )
    expect(screen.getByTestId('source-strava')).toHaveAttribute('data-health', 'healthy')

    rerender(
      <SourceHealth
        source={source({ status: 'error', lastError: 'Token expired' })}
        now={NOW}
        onDisconnect={vi.fn()}
      />
    )
    const broken = screen.getByTestId('source-strava')
    expect(broken).toHaveAttribute('data-health', 'error')
    expect(broken.className).toContain('border-l-destructive')
  })

  it('calls out a source that stopped sending without erroring', () => {
    render(
      <SourceHealth
        source={source({ lastSyncedAt: new Date(NOW - 5 * DAY).toISOString() })}
        now={NOW}
        onDisconnect={vi.fn()}
      />
    )

    expect(screen.getByText('Out of date')).toBeInTheDocument()
    expect(
      screen.getByText(/has not sent anything for a while/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reconnect' })).toBeInTheDocument()
  })

  it('distinguishes a source waiting for its first sync from a broken one', () => {
    render(
      <SourceHealth
        source={source({ lastSyncedAt: null, recordCount: 0, firstCapturedAt: null, lastCapturedAt: null })}
        now={NOW}
        onDisconnect={vi.fn()}
      />
    )

    expect(screen.getByText('Waiting for first sync')).toBeInTheDocument()
    expect(screen.getByText('Last synced Never')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Reconnect' })).not.toBeInTheDocument()
  })

  it('separates disconnecting from deleting what was already imported', async () => {
    const user = userEvent.setup()
    const onDisconnect = vi.fn()
    render(<SourceHealth source={source()} now={NOW} onDisconnect={onDisconnect} />)

    await user.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(onDisconnect).toHaveBeenCalledWith(false)

    await user.click(
      screen.getByRole('button', { name: 'Disconnect and delete imported entries' })
    )
    expect(onDisconnect).toHaveBeenCalledWith(true)
  })
})
