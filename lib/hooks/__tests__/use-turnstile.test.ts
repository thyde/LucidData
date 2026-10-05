import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

interface RenderOptions {
  sitekey: string
  action: string
  appearance: string
  callback: (token: string) => void
  'error-callback': (code: string) => boolean
  'before-interactive-callback': () => void
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
    interact: () => options!['before-interactive-callback'](),
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
  vi.useRealTimers()
  vi.unstubAllEnvs()
  delete window.turnstile
  document.head.querySelectorAll('script').forEach((script) => script.remove())
})

/** Render a widget, let it solve its first check, and use that token. */
async function readyWidget() {
  const fake = fakeTurnstile()
  window.turnstile = fake.api
  const { mod, turnstile } = await loadHook()
  turnstile.attach(document.createElement('div'))
  await vi.waitFor(() => expect(fake.api.render).toHaveBeenCalled())
  fake.solve('token-1')
  await turnstile.getToken()
  return { fake, mod, turnstile }
}

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
    const { fake, turnstile } = await readyWidget()

    const next = turnstile.getToken()
    await vi.waitFor(() => expect(fake.api.reset).toHaveBeenCalledWith('widget-1'))
    fake.solve('token-2')

    await expect(next).resolves.toBe('token-2')
  })

  it('sends no token, rather than blocking the form, when the check fails', async () => {
    const { fake, turnstile } = await readyWidget()

    const pending = turnstile.getToken()
    await vi.waitFor(() => expect(fake.api.reset).toHaveBeenCalled())
    fake.fail()

    await expect(pending).resolves.toBeUndefined()
  })

  it('gives up after the wait limit when the check never answers', async () => {
    vi.useFakeTimers()
    const { fake, mod, turnstile } = await readyWidget()

    const pending = turnstile.getToken()
    await vi.waitFor(() => expect(fake.api.reset).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(mod.TURNSTILE_WAIT_MS)

    await expect(pending).resolves.toBeUndefined()
    // The abandoned check is replaced on the next attempt rather than waited on again.
    void turnstile.getToken()
    await vi.waitFor(() => expect(fake.api.reset).toHaveBeenCalledTimes(2))
  })

  it('keeps waiting while Cloudflare asks the visitor to interact', async () => {
    vi.useFakeTimers()
    const { fake, mod, turnstile } = await readyWidget()

    let settled = false
    const pending = turnstile.getToken().then((token) => {
      settled = true
      return token
    })
    await vi.waitFor(() => expect(fake.api.reset).toHaveBeenCalled())
    fake.interact()
    await vi.advanceTimersByTimeAsync(mod.TURNSTILE_WAIT_MS * 3)
    expect(settled).toBe(false)

    fake.solve('token-after-click')
    await expect(pending).resolves.toBe('token-after-click')
  })

  it('sends no token when the script cannot load', async () => {
    const { turnstile } = await loadHook()
    turnstile.attach(document.createElement('div'))

    const script = document.head.querySelector('script')!
    script.dispatchEvent(new Event('error'))

    await expect(turnstile.getToken()).resolves.toBeUndefined()
  })

  it('removes the widget when its element goes away', async () => {
    const fake = fakeTurnstile()
    window.turnstile = fake.api
    const { turnstile } = await loadHook()

    const cleanup = turnstile.attach(document.createElement('div'))
    await vi.waitFor(() => expect(fake.api.render).toHaveBeenCalled())
    cleanup?.()

    expect(fake.api.remove).toHaveBeenCalledWith('widget-1')
    await expect(turnstile.getToken()).resolves.toBeUndefined()
  })
})
