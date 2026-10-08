import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const pathname = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/actions/legal.actions', () => ({
  acceptLegalDocumentsAction: vi.fn(),
}))

const { LegalGateBoundary } = await import('@/components/legal/legal-gate-boundary')

function renderAt(path: string, outstanding: ('terms' | 'privacy')[]) {
  pathname.mockReturnValue(path)
  return render(
    <LegalGateBoundary outstanding={outstanding} returning={false}>
      <p>page content</p>
    </LegalGateBoundary>
  )
}

beforeEach(() => {
  pathname.mockReset()
})

describe('LegalGateBoundary', () => {
  it('replaces the page with the prompt while documents are outstanding', () => {
    renderAt('/dashboard', ['terms', 'privacy'])
    expect(screen.getByRole('heading', { level: 1, name: 'Review our terms' })).toBeInTheDocument()
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
  })

  it('keeps settings and the privacy page open, so export and deletion stay possible', () => {
    for (const path of ['/settings', '/privacy', '/privacy/requests']) {
      const { unmount } = renderAt(path, ['terms'])
      expect(screen.getByText('page content')).toBeInTheDocument()
      unmount()
    }
  })

  it('does not treat a lookalike path as exempt', () => {
    renderAt('/settings-export', ['terms'])
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
  })

  it('shows the page once everything is accepted', () => {
    renderAt('/dashboard', [])
    expect(screen.getByText('page content')).toBeInTheDocument()
  })
})
