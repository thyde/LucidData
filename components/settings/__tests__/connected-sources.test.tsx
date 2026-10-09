import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const listConnectorsAction = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/lib/hooks/usePendingIngest', () => ({
  usePendingIngest: () => ({ status: 'idle', imported: 0, error: null, drain: vi.fn() }),
}))
vi.mock('@/lib/actions/connector.actions', () => ({
  listConnectorsAction: (...a: unknown[]) => listConnectorsAction(...a),
  disconnectSourceAction: vi.fn(),
}))

const { ConnectedSources } = await import('@/components/settings/connected-sources')

beforeEach(() => {
  listConnectorsAction.mockReset()
})

describe('ConnectedSources', () => {
  it('points to the imports when no service can be connected', async () => {
    listConnectorsAction.mockResolvedValue({ available: [], connected: [] })
    render(<ConnectedSources />)

    expect(await screen.findByText(/No service can be connected yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'vault page' })).toHaveAttribute('href', '/vault')
    // Nothing promises a connection that cannot be made.
    expect(screen.queryByText(/your vault fills without typing/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Connect / })).not.toBeInTheDocument()
  })

  it('offers each service that can be connected', async () => {
    listConnectorsAction.mockResolvedValue({ available: [{ id: 'withings', label: 'Withings' }], connected: [] })
    render(<ConnectedSources />)

    expect(await screen.findByRole('link', { name: 'Connect Withings' })).toHaveAttribute(
      'href',
      '/api/connectors/withings/authorize'
    )
    expect(screen.getByText(/your vault fills without typing/)).toBeInTheDocument()
  })
})
