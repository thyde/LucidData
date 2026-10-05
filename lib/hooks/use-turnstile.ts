'use client'

import { useCallback, useRef } from 'react'

/** Cloudflare requires this exact URL: a proxied or cached copy breaks when they ship updates. */
export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

const LOAD_FAILED = 'The security check could not load. Check your connection and try again.'
const CHECK_FAILED = 'The security check did not finish. Try again.'

interface TurnstileRenderOptions {
  sitekey: string
  action: string
  appearance: 'always' | 'execute' | 'interaction-only'
  size: 'normal' | 'flexible' | 'compact'
  retry: 'auto' | 'never'
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': (code: string) => boolean
  'timeout-callback': () => void
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loader: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.onload = () => {
      if (window.turnstile) return resolve(window.turnstile)
      loader = null
      reject(new Error(LOAD_FAILED))
    }
    script.onerror = () => {
      loader = null
      script.remove()
      reject(new Error(LOAD_FAILED))
    }
    document.head.appendChild(script)
  })
  return loader
}

interface Waiter {
  resolve: (token: string) => void
  reject: (error: Error) => void
}

export interface Turnstile {
  /** Callback ref for an empty element. The widget stays invisible unless the visitor must interact. */
  attach: (node: HTMLDivElement | null) => (() => void) | undefined
  /**
   * A single-use token for one Supabase Auth call, or undefined when this
   * deployment has no site key and Supabase is not asking for one.
   */
  getToken: () => Promise<string | undefined>
}

/**
 * Cloudflare Turnstile for the calls Supabase Auth protects with CAPTCHA:
 * sign-up, password sign-in, and password reset. A token works once, so every
 * call asks for a new one.
 */
export function useTurnstile(action: string): Turnstile {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null)
  const ready = useRef<Promise<void> | null>(null)
  const unused = useRef<string | null>(null)
  const waiter = useRef<Waiter | null>(null)

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (!siteKey || !node) return undefined
      let detached = false

      const settle = (outcome: { token: string } | { error: Error }) => {
        const pending = waiter.current
        waiter.current = null
        if ('token' in outcome) {
          if (pending) pending.resolve(outcome.token)
          else unused.current = outcome.token
        } else {
          unused.current = null
          pending?.reject(outcome.error)
        }
      }

      const rendering = loadTurnstile().then((api) => {
        if (detached) return
        const id = api.render(node, {
          sitekey: siteKey,
          action,
          appearance: 'interaction-only',
          size: 'flexible',
          retry: 'never',
          callback: (token) => settle({ token }),
          'expired-callback': () => {
            unused.current = null
          },
          'error-callback': () => {
            settle({ error: new Error(CHECK_FAILED) })
            return true
          },
          'timeout-callback': () => settle({ error: new Error(CHECK_FAILED) }),
        })
        if (!id) throw new Error(LOAD_FAILED)
        widget.current = { api, id }
      })
      // Surfaced by getToken; this only stops an unhandled rejection before the first submit.
      rendering.catch(() => undefined)
      ready.current = rendering

      return () => {
        detached = true
        if (widget.current) widget.current.api.remove(widget.current.id)
        widget.current = null
        ready.current = null
        unused.current = null
        waiter.current?.reject(new Error(CHECK_FAILED))
        waiter.current = null
      }
    },
    [siteKey, action]
  )

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!siteKey) return undefined
    if (!ready.current) throw new Error(LOAD_FAILED)
    await ready.current
    const current = widget.current
    if (!current) throw new Error(LOAD_FAILED)

    const token = unused.current
    if (token) {
      unused.current = null
      return token
    }
    return new Promise<string>((resolve, reject) => {
      waiter.current?.reject(new Error(CHECK_FAILED))
      waiter.current = { resolve, reject }
      current.api.reset(current.id)
    })
  }, [siteKey])

  return { attach, getToken }
}
