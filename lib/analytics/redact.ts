// Only public marketing and sign-in pages are counted. Signed-in pages, share links, and invitations never are.
const PUBLIC_PATHS = new Set([
  '/',
  '/for-individuals',
  '/for-business',
  '/pricing',
  '/login',
  '/register',
  '/signup',
  '/forgot-password',
])
const PUBLIC_PREFIXES = ['/trust', '/legal']

export interface AnalyticsEvent {
  type: 'pageview' | 'event'
  url: string
}

/** Vercel Web Analytics `beforeSend` hook: drop private pages and strip query strings and fragments. */
export function redactAnalyticsEvent<T extends AnalyticsEvent>(event: T): T | null {
  let url: URL
  try {
    url = new URL(event.url)
  } catch {
    return null
  }
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const isPublic =
    PUBLIC_PATHS.has(path) ||
    PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  if (!isPublic) return null
  return { ...event, url: `${url.origin}${path}` }
}
