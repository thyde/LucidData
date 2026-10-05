// Strips personal data and secrets from error-log entries before they reach Vercel's runtime logs.

const MAX_STRING = 300
const MAX_STACK_LINES = 8
const REDACTED = '[redacted]'

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g
// A query string or fragment attached to an absolute URL or a path.
const URL_QUERY = /((?:https?:\/\/|(?<![\w.])\/)[^\s?#"'<>]*)[?#][^\s"'<>]*/g
const OPAQUE_TOKEN = /[A-Za-z0-9_-]{32,}/g
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Metadata values kept as text. Everything else must be a number, a boolean, or an id.
const DESCRIPTIVE_KEYS = new Set([
  'event',
  'job',
  'kind',
  'method',
  'path',
  'plan',
  'provider',
  'role',
  'source',
  'status',
  'step_up_action',
  'type',
  'url',
])

export function scrubLogText(text: string): string {
  return text
    .replace(JWT, REDACTED)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(EMAIL, '[email]')
    .replace(URL_QUERY, '$1')
    .replace(OPAQUE_TOKEN, (match) => (UUID.test(match) ? match : REDACTED))
    .slice(0, MAX_STRING)
}

function isIdentifierKey(key: string): boolean {
  return /(^|_)id$|[a-z]Id$/.test(key)
}

function scrubMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    } else if (typeof value === 'string' && (isIdentifierKey(key) || DESCRIPTIVE_KEYS.has(key))) {
      out[key] = scrubLogText(value)
    } else if (value !== undefined) {
      out[key] = REDACTED
    }
  }
  return out
}

export interface LogEntry {
  timestamp: string
  severity: string
  message: string
  stack?: string
  userId?: string
  action?: string
  resource?: string
  metadata?: Record<string, unknown>
}

export function scrubLogEntry(entry: LogEntry): LogEntry {
  return {
    timestamp: entry.timestamp,
    severity: entry.severity,
    message: scrubLogText(entry.message),
    ...(entry.stack && {
      stack: entry.stack
        .split('\n')
        .slice(0, MAX_STACK_LINES)
        .map((line) => scrubLogText(line))
        .join('\n'),
    }),
    ...(entry.userId && { userId: scrubLogText(entry.userId) }),
    ...(entry.action && { action: scrubLogText(entry.action) }),
    ...(entry.resource && { resource: scrubLogText(entry.resource) }),
    ...(entry.metadata && { metadata: scrubMetadata(entry.metadata) }),
  }
}
