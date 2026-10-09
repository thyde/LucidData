import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import userEvent from '@testing-library/user-event'
import { act, render, screen } from '@/test/helpers/render'
import { sealShare } from '@luciddata/core/crypto/share-link'
import { buildShareSnapshot } from '@luciddata/core/health/share'
import { buildTimeline } from '@luciddata/core/health/timeline'
import { SharedSummaryViewer, sourcesSentence } from '../shared-summary-viewer'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

const ID = '3f2a0c4e-1b5d-4c6e-8f70-9a1b2c3d4e5f'
const TIMELINE = buildTimeline(
  [
    { schemaType: 'fitness_daily', data: { date: '2026-09-14', steps: 9400 }, provider: 'garmin' },
    { schemaType: 'fitness_daily', data: { date: '2026-09-15', steps: 7000 }, provider: null },
  ],
  { timeZone: 'UTC', to: '2026-09-30' }
)
const SNAPSHOT = buildShareSnapshot(TIMELINE, {
  metrics: ['steps'],
  from: '2026-09-01',
  to: '2026-09-30',
  sharedBy: 'Alex',
  note: 'Since the new knee brace',
  now: new Date('2026-09-30T12:00:00Z'),
})

const fetchMock = vi.fn()

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

function visit(hash: string) {
  window.history.replaceState(null, '', `/share/${ID}${hash}`)
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('SharedSummaryViewer', () => {
  it('opens a summary with the key from the link, which it never sends', async () => {
    const sealed = await sealShare(JSON.stringify(SNAPSHOT))
    fetchMock.mockReturnValue(
      respond(200, { state: 'open', ciphertext: sealed.ciphertext, expiresAt: '2026-10-07T12:00:00.000Z', createdAt: SNAPSHOT.createdAt })
    )
    visit(`#${sealed.key}`)
    render(<SharedSummaryViewer id={ID} />)

    expect(await screen.findByRole('heading', { name: 'Health summary', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('share-range')).toHaveTextContent('Shared by Alex. Figures from Sep 1, 2026 to Sep 30, 2026.')
    expect(screen.getByTestId('share-note')).toHaveTextContent('Since the new knee brace')
    expect(screen.getByTestId('metric-steps')).toBeInTheDocument()
    expect(screen.getByText(/They come from Garmin, and from what the person typed in\./)).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/share/${ID}`)
    expect(JSON.stringify([url, init])).not.toContain(sealed.key)
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
  })

  it('asks for the whole link when the key is missing, without asking the server', async () => {
    visit('')
    render(<SharedSummaryViewer id={ID} />)
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens once the whole link is pasted into the same tab', async () => {
    visit('')
    render(<SharedSummaryViewer id={ID} />)
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument()

    const sealed = await sealShare(JSON.stringify(SNAPSHOT))
    fetchMock.mockReturnValue(
      respond(200, { state: 'open', ciphertext: sealed.ciphertext, expiresAt: '2026-10-07T12:00:00.000Z', createdAt: SNAPSHOT.createdAt })
    )
    // Only the fragment changes, which a browser handles without reloading.
    visit(`#${sealed.key}`)
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByRole('heading', { name: 'Health summary', level: 1 })).toBeInTheDocument()
  })

  it.each([
    [410, { state: 'revoked' }, 'This summary was revoked'],
    [410, { state: 'expired' }, 'This link has expired'],
    [404, { state: 'missing' }, 'This summary does not exist'],
    [429, { state: 'rate_limited' }, 'Too many requests'],
  ])('explains a %i %o', async (status, body, title) => {
    const { key } = await sealShare('{}')
    fetchMock.mockReturnValue(respond(status, body))
    visit(`#${key}`)
    render(<SharedSummaryViewer id={ID} />)
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
  })

  it('says when the key does not open the summary', async () => {
    const sealed = await sealShare(JSON.stringify(SNAPSHOT))
    const other = await sealShare('{}')
    fetchMock.mockReturnValue(
      respond(200, { state: 'open', ciphertext: sealed.ciphertext, expiresAt: '2026-10-07T12:00:00.000Z', createdAt: SNAPSHOT.createdAt })
    )
    visit(`#${other.key}`)
    render(<SharedSummaryViewer id={ID} />)
    expect(await screen.findByRole('heading', { name: 'This link cannot open the summary' })).toBeInTheDocument()
  })

  it('refuses something that decrypts but is not a summary', async () => {
    const sealed = await sealShare(JSON.stringify({ version: 1, script: '<img src=x onerror=alert(1)>' }))
    fetchMock.mockReturnValue(
      respond(200, { state: 'open', ciphertext: sealed.ciphertext, expiresAt: '2026-10-07T12:00:00.000Z', createdAt: SNAPSHOT.createdAt })
    )
    visit(`#${sealed.key}`)
    render(<SharedSummaryViewer id={ID} />)
    expect(await screen.findByRole('heading', { name: 'This link cannot open the summary' })).toBeInTheDocument()
  })

  it('tries again after a network failure', async () => {
    const sealed = await sealShare(JSON.stringify(SNAPSHOT))
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockReturnValueOnce(
        respond(200, { state: 'open', ciphertext: sealed.ciphertext, expiresAt: '2026-10-07T12:00:00.000Z', createdAt: SNAPSHOT.createdAt })
      )
    visit(`#${sealed.key}`)
    render(<SharedSummaryViewer id={ID} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Health summary', level: 1 })).toBeInTheDocument()
  })
})

describe('sourcesSentence', () => {
  const series = (sources: string[][]) =>
    [{ days: sources.map((list, index) => ({ date: `2026-09-1${index}`, value: 1, source: list[0], sources: list })) }] as never

  it('names devices and typed values plainly', () => {
    expect(sourcesSentence(series([['garmin'], ['apple-health']]))).toBe('They come from Garmin and Apple Health.')
    expect(sourcesSentence(series([['manual']]))).toBe('The person typed them in themselves.')
    expect(sourcesSentence(series([['manual', 'garmin']]))).toBe('They come from Garmin, and from what the person typed in.')
  })
})
