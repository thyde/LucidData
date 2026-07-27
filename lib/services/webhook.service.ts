/**
 * LD-602 outbound webhooks.
 *
 * Without these, every organization polls for state changes, which costs us
 * requests and costs them latency.
 *
 * Two rules shape everything here.
 *
 * A payload carries identifiers and timestamps only. Never a user id, an email
 * address, a data category, a purpose string, a credential claim, or anything
 * from a vault. A webhook goes to a URL the organization controls, over a
 * network we do not, to a system we have not reviewed. The recipient calls back
 * with its API key to fetch detail, which puts the disclosure behind
 * authentication where it belongs. `assertNoPersonalData` enforces this at
 * runtime and a test enforces it at build time.
 *
 * A destination URL is attacker-influenced input. Our servers can reach
 * infrastructure the internet cannot, including cloud metadata endpoints, so a
 * URL is checked against internal address ranges before we ever fetch it.
 */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'
import { hash } from '@/lib/crypto/hashing'
import type { Json } from '@/types/database.types'
import { UserFacingError } from '@/lib/actions/action-result'

/** Events an organization can subscribe to. */
export const WEBHOOK_EVENTS = [
  'consent_request.approved',
  'consent_request.denied',
  'consent.revoked',
  'credential_request.approved',
  'credential_request.denied',
  'credential.revoked',
  'data_order.completed',
  'bulk_job.completed',
  'bulk_job.failed',
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value)
}

/** Attempts before a delivery is given up on. */
export const MAX_DELIVERY_ATTEMPTS = 8

const BASE_BACKOFF_MS = 30 * 1000
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000

/** How old a signature may be before it is treated as a replay. */
export const SIGNATURE_TOLERANCE_SECONDS = 300

export function backoffMsForAttempt(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS)
}

/**
 * The whole payload shape. Deliberately narrow: an event name, who it is for,
 * what changed, and when. Anything a recipient wants beyond this is fetched
 * with their API key.
 */
export interface WebhookPayload {
  id: string
  event: WebhookEvent
  organizationId: string
  resource: { type: string; id: string }
  occurredAt: string
  apiVersion: string
}

export const WEBHOOK_API_VERSION = '2026-07-26'

/**
 * Keys that must never appear in a payload. Checked recursively, because a
 * nested object is just as visible to the recipient as a top-level one.
 */
const FORBIDDEN_KEYS = [
  'userid',
  'user_id',
  'subjectid',
  'subject_id',
  'email',
  'name',
  'category',
  'datacategory',
  'data_category',
  'purpose',
  'claims',
  'payload',
  'ciphertext',
  'label',
  'detail',
  'note',
  'message',
]

export class WebhookPayloadError extends Error {
  constructor(key: string) {
    super(`Webhook payloads must not carry "${key}"`)
    this.name = 'WebhookPayloadError'
  }
}

/**
 * Refuse to send a payload carrying anything that identifies a person. This is
 * a runtime guard rather than a convention, because the failure mode is a
 * silent, permanent disclosure to a third party.
 */
export function assertNoPersonalData(value: unknown, path: string[] = []): void {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) assertNoPersonalData(item, path)
    return
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
      throw new WebhookPayloadError([...path, key].join('.'))
    }
    assertNoPersonalData(nested, [...path, key])
  }
}

export function buildPayload(input: {
  id: string
  event: WebhookEvent
  organizationId: string
  resourceType: string
  resourceId: string
  occurredAt?: string
}): WebhookPayload {
  const payload: WebhookPayload = {
    id: input.id,
    event: input.event,
    organizationId: input.organizationId,
    resource: { type: input.resourceType, id: input.resourceId },
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    apiVersion: WEBHOOK_API_VERSION,
  }
  assertNoPersonalData(payload)
  return payload
}

/**
 * HMAC-SHA256 over `${timestamp}.${body}`, matching the pattern already proven
 * in the Stripe webhook handler. The timestamp is inside the signed material,
 * so it cannot be changed to replay an old body.
 */
export function signPayload(secret: string, body: string, timestampSeconds: number): string {
  return createHmac('sha256', secret)
    .update(`${timestampSeconds}.${body}`, 'utf8')
    .digest('hex')
}

export function signatureHeader(secret: string, body: string, timestampSeconds: number): string {
  return `t=${timestampSeconds},v1=${signPayload(secret, body, timestampSeconds)}`
}

/**
 * Verify a signature header. Exported so an integrator can copy it, and so the
 * tolerance behaviour is testable rather than described in prose.
 */
export function verifySignature(
  secret: string,
  body: string,
  header: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=')
      return [key, rest.join('=')]
    })
  )
  const timestamp = Number(parts.t)
  const provided = parts.v1
  if (!Number.isFinite(timestamp) || !provided) return false
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false

  const expected = signPayload(secret, body, timestamp)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export class WebhookUrlError extends UserFacingError {
  constructor(message: string) {
    super(message, 'webhook_url')
    this.name = 'WebhookUrlError'
  }
}

/**
 * Address ranges our servers can reach but the public internet cannot. A
 * webhook pointed at one of these turns our outbound fetch into a request the
 * caller could not make themselves, which is server-side request forgery.
 *
 * Takes an IP literal rather than a name, so it can be applied to a resolved
 * address as well as to a URL the caller typed. Checking only the typed name is
 * not enough: an attacker controls their own DNS, so `hooks.example.com` can
 * resolve to 169.254.169.254 and read cloud instance credentials.
 */
export function isPrivateAddress(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, '')

  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true
    // Unique-local fc00::/7 and link-local fe80::/10.
    if (/^f[cd]/.test(host) || host.startsWith('fe80')) return true
    // An IPv4-mapped address is still an IPv4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host)
    if (mapped) return isPrivateAddress(mapped[1])
    return false
  }

  const octets = host.split('.').map(Number)
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false
  }

  const [a, b] = octets
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  // Link-local, and with it the cloud metadata endpoint at 169.254.169.254.
  if (a === 169 && b === 254) return true
  // Carrier-grade NAT.
  if (a === 100 && b >= 64 && b <= 127) return true
  // Multicast and reserved.
  if (a >= 224) return true
  return false
}

function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '')
  return host.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(host)
}

/**
 * Names that are unreachable or ambiguous from the public internet, checked
 * before we spend a DNS lookup on them.
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  // Anything not publicly resolvable.
  if (host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true
  }

  return isPrivateAddress(host)
}

/** Resolve a hostname to every address it points at. Injectable for tests. */
export type AddressResolver = (hostname: string) => Promise<string[]>

const defaultResolver: AddressResolver = async (hostname) => {
  const { lookup } = await import('node:dns/promises')
  const records = await lookup(hostname, { all: true })
  return records.map((record) => record.address)
}

/**
 * Confirm a hostname resolves only to public addresses.
 *
 * Run immediately before delivery rather than at registration, because the
 * owner of a name can repoint it after we accept it.
 *
 * Residual risk, stated rather than hidden: this is a check followed by a
 * separate connection, so a name that returns a public address here and a
 * private one microseconds later still gets through. Closing that fully means
 * pinning the resolved address into the socket. Refusing redirects removes the
 * easier version of the same attack.
 */
export async function assertResolvesPublicly(
  hostname: string,
  resolver: AddressResolver = defaultResolver
): Promise<void> {
  // A literal was already checked directly; there is nothing to resolve.
  if (isIpLiteral(hostname)) return

  let addresses: string[]
  try {
    addresses = await resolver(hostname)
  } catch {
    throw new WebhookUrlError('That host could not be resolved')
  }

  if (addresses.length === 0) {
    throw new WebhookUrlError('That host could not be resolved')
  }
  if (addresses.some(isPrivateAddress)) {
    throw new WebhookUrlError('That address is not reachable from the public internet')
  }
}

/** Validate a destination before it is ever stored or fetched. */
export function assertDeliverableUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new WebhookUrlError('That is not a valid URL')
  }
  if (url.protocol !== 'https:') {
    throw new WebhookUrlError('Webhook URLs must use https')
  }
  if (isPrivateHost(url.hostname)) {
    throw new WebhookUrlError('That address is not reachable from the public internet')
  }
  if (url.username || url.password) {
    throw new WebhookUrlError('Webhook URLs must not embed credentials')
  }
  return url
}

export interface CreatedWebhook {
  id: string
  url: string
  events: WebhookEvent[]
  /** Shown once. We store only the hash. */
  secret: string
}

export async function createWebhook(input: {
  organizationId: string
  url: string
  events: WebhookEvent[]
  description?: string
}): Promise<CreatedWebhook> {
  assertDeliverableUrl(input.url)
  if (input.events.length === 0) {
    throw new UserFacingError('Subscribe to at least one event')
  }
  for (const event of input.events) {
    if (!isWebhookEvent(event)) throw new UserFacingError(`Unknown event: ${event}`)
  }

  const secret = `whsec_${randomBytes(24).toString('base64url')}`
  const service = createServiceClient()
  const { data, error } = await service
    .from('org_webhooks')
    .insert({
      organization_id: input.organizationId,
      url: input.url,
      secret_hash: hash(secret),
      secret_prefix: secret.slice(0, 11),
      events: input.events,
      description: input.description ?? null,
    })
    .select('id, url, events')
    .single()
  if (error) throw error

  return {
    id: data.id as string,
    url: data.url as string,
    events: data.events as WebhookEvent[],
    secret,
  }
}

/**
 * Queue a delivery for every subscribed endpoint, then attempt it as soon as
 * the response has been sent.
 *
 * Queuing first rather than sending inline, so a slow or dead endpoint cannot
 * make a user-facing action hang. Dispatching in `after()` rather than waiting
 * for the scheduler, because the Vercel Hobby plan permits only a daily cron
 * and a webhook that arrives up to a day later is not a webhook. The scheduled
 * sweep stays as the retry net for anything this attempt fails to deliver.
 */
export async function enqueueEvent(
  organizationId: string,
  event: WebhookEvent,
  resource: { type: string; id: string }
): Promise<number> {
  const service = createServiceClient()
  const { data: webhooks, error } = await service
    .from('org_webhooks')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .contains('events', [event])
  if (error) throw error
  if (!webhooks || webhooks.length === 0) return 0

  const rows = webhooks.map((webhook) => ({
    webhook_id: webhook.id as string,
    event,
    payload: buildPayload({
      id: randomUUID(),
      event,
      organizationId,
      resourceType: resource.type,
      resourceId: resource.id,
    }) as unknown as Json,
  }))

  const { error: insertError } = await service.from('webhook_deliveries').insert(rows)
  if (insertError) throw insertError

  scheduleImmediateDispatch()
  return rows.length
}

/**
 * Attempt delivery after the response is sent. Best-effort by design: the row
 * is already queued, so a failure here costs latency rather than the event.
 *
 * `after()` only works inside a request scope. Called from a job or a script it
 * throws, which is why the failure is swallowed rather than propagated.
 */
function scheduleImmediateDispatch(): void {
  try {
    after(async () => {
      await dispatchDueDeliveries().catch((error) => {
        errorLogger.log(error, ErrorSeverity.LOW, {
          action: 'WEBHOOK_IMMEDIATE_DISPATCH_FAILED',
          resource: 'webhook_deliveries',
        })
      })
    })
  } catch {
    // No request scope. The scheduled sweep will pick the delivery up.
  }
}

export interface DeliveryResult {
  processed: number
  failed: number
}

/**
 * Send every due delivery. Runs on the LD-601 scheduler, so a retry does not
 * need a request to hang off.
 */
export async function dispatchDueDeliveries(
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
  resolver: AddressResolver = defaultResolver
): Promise<DeliveryResult> {
  const service = createServiceClient()
  const result: DeliveryResult = { processed: 0, failed: 0 }

  const { data: due, error } = await service
    .from('webhook_deliveries')
    .select('id, webhook_id, event, payload, attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', now.toISOString())
    .limit(100)
  if (error) throw error
  if (!due || due.length === 0) return result

  for (const delivery of due) {
    const { data: webhook } = await service
      .from('org_webhooks')
      .select('url, secret_hash, status')
      .eq('id', delivery.webhook_id as string)
      .maybeSingle()

    const attempt = (delivery.attempts as number) + 1

    if (!webhook || webhook.status !== 'active') {
      await service
        .from('webhook_deliveries')
        .update({ status: 'failed', attempts: attempt, last_error: 'Endpoint is not active' })
        .eq('id', delivery.id as string)
      result.failed += 1
      continue
    }

    const body = JSON.stringify(delivery.payload)
    const timestamp = Math.floor(now.getTime() / 1000)
    // The stored hash is the signing key. There is no plaintext secret on the
    // server, so a database read alone cannot forge a callback the recipient
    // would accept without also knowing how we derive it.
    const signature = signatureHeader(webhook.secret_hash as string, body, timestamp)

    try {
      const target = assertDeliverableUrl(webhook.url as string)
      // Checked here, not only at registration, because the owner of a name can
      // repoint it at a private address after we accepted it.
      await assertResolvesPublicly(target.hostname, resolver)
      const response = await fetchImpl(webhook.url as string, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-luciddata-signature': signature,
          'x-luciddata-event': delivery.event as string,
          'x-luciddata-api-version': WEBHOOK_API_VERSION,
        },
        body,
        // Following a redirect would hand back the destination choice to the
        // endpoint, which is the cheapest way around the check above.
        redirect: 'manual',
      })

      if (response.status >= 300 && response.status < 400) {
        throw new Error('Endpoint redirected. A webhook URL must be the final destination')
      }

      if (response.ok) {
        await service
          .from('webhook_deliveries')
          .update({
            status: 'delivered',
            attempts: attempt,
            response_status: response.status,
            delivered_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', delivery.id as string)
        result.processed += 1
        continue
      }

      throw new Error(`Endpoint returned ${response.status}`)
    } catch (error) {
      const exhausted = attempt >= MAX_DELIVERY_ATTEMPTS
      const message = error instanceof Error ? error.message : 'Delivery failed'
      await service
        .from('webhook_deliveries')
        .update({
          status: exhausted ? 'failed' : 'pending',
          attempts: attempt,
          last_error: message.slice(0, 500),
          next_attempt_at: exhausted
            ? new Date(now.getTime()).toISOString()
            : new Date(now.getTime() + backoffMsForAttempt(attempt)).toISOString(),
        })
        .eq('id', delivery.id as string)
        .then(undefined, () => undefined)

      if (exhausted) {
        errorLogger.log(error, ErrorSeverity.MEDIUM, {
          action: 'WEBHOOK_DELIVERY_EXHAUSTED',
          resource: 'webhook_deliveries',
          metadata: { deliveryId: delivery.id, attempts: attempt },
        })
      }
      result.failed += 1
    }
  }

  return result
}
