import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

interface RenderOptions {
  sitekey: string
  action: string
  appearance: string
  callback: (token: string) => void
  'error-callback': (code: string) => boolean
}

function fakeTurnstile() {
  let options: RenderOptions | null = null
  const api = {
    render: vi.fn((_container: HTMLElement, rendered: RenderOptions) => {
      options = rendered
      return 'widget-1'
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
  return {
    api,
    solve: (token: string) => options!.callback(token),
    fail: () => options!['error-callback']('300030'),
  }
}

async function loadHook(action = 'login') {
  const mod = await import('@/lib/hooks/use-turnstile')
  const { result } = renderHook(() => mod.useTurnstile(action))
  return { mod, turnstile: result.current }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete window.turnstile
  document.head.querySelectorAll('script').forEach((script) => script.remove())
})

describe('useTurnstile', () => {
  it('asks for no token when the deployment has no site key', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    const { turnstile } = await loadHook()

    turnstile.attach(document.createElement('div'))

    await expect(turnstile.getToken()).resolves.toBeUndefined()
    expect(document.head.querySelector('script')).toBeNull()
  })

  it('loads the Cloudflare script once, from the exact published URL', async () => {
    const { mod, turnstile } = await loadHook()
    const { result: second } = renderHook(() => mod.useTurnstile('signup'))

    turnstile.attach(document.createElement('div'))
    second.current.attach(document.createElement('div'))

    const scripts = document.head.querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    expect(scripts[0].getAttribute('src')).toBe(mod.TURNSTILE_SCRIPT_SRC)
    expect(mod.TURNSTILE_SCRIPT_SRC).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    )
  })

  it('renders an invisible widget and hands over the token it solved', async () => {
    const fake = fakeTurnstile()
    window.turnstile = fake.api
    const { turnstile } = await loadHook('login')

    turnstile.attach(document.createElement('div'))
    await vi.waitFor(() => expect(fake.api.render).toHaveBeenCalled())
    fake.solve('token-1')

    await expect(turnstile.getToken()).resolves.toBe('token-1')
    expect(fake.api.render.mock.calls[0][1]).toMatchObject({
      sitekey: 'site-key',
      action: 'login',
      appearance: 'interaction-only',
    })
  })

  it('never hands out the same token twice', async () => {
    const fake = fakeTurnstile()
    window.turnstile = fake.api
    const { turnstile } = await loadHook()

    turnstile.attach(document.createElement('div'))
    await vi.waitFor(() => expect(fake.api.render).toHaveBeenCalled())
    fake.solve('token-1')
    await turnstile.getToken()

    const next = turnstile.getToken()
    await vi.waitFor(() => expect(fake.api.reset).toHaveBeenCalledWith('widget-1'))
    fake.solve('token-2')

    await expect(next).resolves.toBe('token-2')
  })

  it('reports a failed check instead of waiting forever', async () => {
    const fake = fakeTurnstile()
    window.turnstile = fake.api
    const { turnstile } = await loadHook()

    turnstile.attach(document.createElement('div'))
    await vi.waitFor(() => expect(fake.api.render).toHaveBeenCalled())

    const pending = turnstile.getToken()
    await vi.waitFor(() => expect(fake.api.reset).toHaveBeenCalled())
    fake.fail()

    await expect(pending).rejects.toThrow(/security check/i)
  })

  it('removes the widget when its element goes away', async () => {
    const fake = fakeTurnstile()
    window.turnstile = fake.api
    const { turnstile } = await loadHook()

    const cleanup = turnstile.attach(document.createElement('div'))
    await vi.waitFor(() => expect(fake.api.render).toHaveBeenCalled())
    cleanup?.()

    expect(fake.api.remove).toHaveBeenCalledWith('widget-1')
    await expect(turnstile.getToken()).rejects.toThrow(/could not load/i)
  })
})
