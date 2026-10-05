'use client'

import { useCallback, useRef } from 'react'

/** Cloudflare requires this exact URL: a proxied or cached copy breaks when they ship updates. */
export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** How long an invisible check may take before the request goes without a token. */
export const TURNSTILE_WAIT_MS = 15_000

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
  'unsupported-callback': () => void
  'before-interactive-callback': () => void
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
      reject(new Error('Turnstile did not start'))
    }
    script.onerror = () => {
      loader = null
      script.remove()
      reject(new Error('Turnstile did not load'))
    }
    document.head.appendChild(script)
  })
  return loader
}

interface Waiter {
  settle: (token: string | undefined) => void
  /** Cloudflare is asking the visitor to interact, so stop the clock. */
  hold: () => void
}

export interface Turnstile {
  /** Callback ref for an empty element. The widget stays invisible unless the visitor must interact. */
  attach: (node: HTMLDivElement | null) => (() => void) | undefined
  /**
   * A single-use token for one Supabase Auth call. Resolves undefined when the
   * deployment has no site key or the check cannot finish; Supabase then decides
   * whether to accept the request, so a check that never loads cannot leave a
   * form waiting forever.
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
  const solving = useRef(false)
  const interacting = useRef(false)
  const unused = useRef<string | null>(null)
  const waiter = useRef<Waiter | null>(null)

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (!siteKey || !node) return undefined
      let detached = false

      const deliver = (token: string | undefined) => {
        solving.current = false
        interacting.current = false
        const pending = waiter.current
        waiter.current = null
        if (pending) pending.settle(token)
        else unused.current = token ?? null
      }

      const rendering = loadTurnstile().then((api) => {
        if (detached) return
        const id = api.render(node, {
          sitekey: siteKey,
          action,
          appearance: 'interaction-only',
          size: 'flexible',
          retry: 'never',
          callback: (token) => deliver(token),
          'expired-callback': () => {
            unused.current = null
          },
          'error-callback': () => {
            deliver(undefined)
            return true
          },
          'timeout-callback': () => deliver(undefined),
          'unsupported-callback': () => deliver(undefined),
          'before-interactive-callback': () => {
            interacting.current = true
            waiter.current?.hold()
          },
        })
        if (!id) return
        widget.current = { api, id }
        solving.current = true
      })
      // A script that never loads only means no token; getToken handles it.
      rendering.catch(() => undefined)
      ready.current = rendering

      return () => {
        detached = true
        if (widget.current) widget.current.api.remove(widget.current.id)
        widget.current = null
        ready.current = null
        solving.current = false
        interacting.current = false
        unused.current = null
        waiter.current?.settle(undefined)
      }
    },
    [siteKey, action]
  )

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!siteKey) return undefined
    try {
      await ready.current
    } catch {
      return undefined
    }
    const current = widget.current
    if (!current) return undefined

    const token = unused.current
    if (token) {
      unused.current = null
      return token
    }
    return new Promise<string | undefined>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const entry: Waiter = {
        settle: (value) => {
          clearTimeout(timer)
          if (waiter.current === entry) waiter.current = null
          resolve(value)
        },
        hold: () => clearTimeout(timer),
      }
      if (!interacting.current) {
        timer = setTimeout(() => {
          // Treat the stuck check as abandoned so the next attempt starts afresh.
          solving.current = false
          entry.settle(undefined)
        }, TURNSTILE_WAIT_MS)
      }
      waiter.current?.settle(undefined)
      waiter.current = entry
      // A check still running from page load delivers here; otherwise start a new one.
      if (!solving.current) {
        solving.current = true
        current.api.reset(current.id)
      }
    })
  }, [siteKey])

  return { attach, getToken }
}
