import { randomUUID } from 'crypto'
import * as shareRepo from '@/lib/repositories/health-share.repository'
import * as consentRepo from '@/lib/repositories/consent.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import { issueConsentReceipt } from '@/lib/services/consent-receipt.service'
import { revokeConsent } from '@/lib/services/consent.service'
import { assertRateLimit } from '@/lib/services/rate-limit.service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'
import { UserFacingError } from '@/lib/actions/action-result'
import { ANYONE_WITH_THE_LINK, LINK_SHARE_PREFIX, MAX_ACTIVE_SHARES } from '@luciddata/core/health/share'
import { METRICS } from '@luciddata/core/health/timeline'
import type { CreateHealthShare } from '@luciddata/core/validations/health-share'
import type { HealthShareSummary } from '@/lib/repositories/health-share.repository'

/**
 * LD-305 health summary sharing.
 *
 * The summary arrives encrypted under a key the server never receives, so this
 * service handles terms, not contents. Each share stands on a consent, which
 * gives it a signed receipt and puts it beside every other grant. Revoking
 * that consent, from here or anywhere else, clears the ciphertext in the
 * database.
 */

const DAY_MS = 86_400_000

/** A view of the same link inside this window is not recorded again in the owner's audit trail. */
const VIEW_AUDIT_WINDOW_MS = 60 * 60 * 1000

export type { HealthShareSummary }

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** The terms in words, as the consent and its receipt state them. */
export function sharePurpose(metrics: readonly string[], rangeStart: string, rangeEnd: string): string {
  const labels = metrics.map((id) => METRICS.find((metric) => metric.id === id)?.label ?? id)
  return `A health summary shared by link: ${listOf(labels)}, from ${rangeStart} to ${rangeEnd}.`
}

export interface CreatedHealthShare {
  id: string
  expiresAt: string
}

/** Store an encrypted summary, behind a consent with a signed receipt. */
export async function createHealthShare(
  userId: string,
  input: CreateHealthShare,
  now: Date = new Date()
): Promise<CreatedHealthShare> {
  await assertRateLimit('healthShare', userId)
  if ((await shareRepo.countOpenShares(userId, now)) >= MAX_ACTIVE_SHARES) {
    throw new UserFacingError(
      `You have ${MAX_ACTIVE_SHARES} shared summaries open. Revoke one before you share another.`,
      'too_many_shares'
    )
  }

  const id = randomUUID()
  const expiresAt = new Date(now.getTime() + input.expiresInDays * DAY_MS).toISOString()
  const recipient = input.label ?? ANYONE_WITH_THE_LINK

  const consent = await consentRepo.createConsent({
    user_id: userId,
    granted_to: `${LINK_SHARE_PREFIX}${id}`,
    granted_to_name: recipient,
    // Whoever opens the link can keep what they see, so the receipt says a
    // copy may be delivered rather than promising revocation can recall it.
    access_level: 'export',
    purpose: sharePurpose(input.metrics, input.rangeStart, input.rangeEnd),
    data_category: 'health',
    end_date: expiresAt,
    consent_type: 'explicit',
  })

  let stored = false
  try {
    await shareRepo.insertShare({
      id,
      user_id: userId,
      consent_id: consent.id,
      ciphertext: input.ciphertext,
      metrics: input.metrics,
      range_start: input.rangeStart,
      range_end: input.rangeEnd,
      expires_at: expiresAt,
    })
    stored = true
    await issueConsentReceipt(consent, 'granted')
    await createAuditEntry({
      userId,
      eventType: 'consent_granted',
      action: `Shared a health summary by link with ${recipient}`,
      consentId: consent.id,
      metadata: {
        healthShareId: id,
        metrics: input.metrics,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        expiresAt,
      },
    })
  } catch (error) {
    // A share without its receipt must not open. Undo both rows; the receipt,
    // if one was written, goes with the consent.
    if (stored) await shareRepo.deleteShare(id, userId).catch(() => undefined)
    await consentRepo.deleteConsent(consent.id, userId).catch(() => undefined)
    throw error
  }

  return { id, expiresAt }
}

export async function listHealthShares(userId: string): Promise<HealthShareSummary[]> {
  return shareRepo.findSharesForUser(userId)
}

/**
 * Revoke a share by revoking its consent, which issues the receipt and the
 * audit entry and, in the database, clears the ciphertext. Revoking twice is
 * harmless.
 */
export async function revokeHealthShare(userId: string, shareId: string): Promise<HealthShareSummary> {
  const share = await shareRepo.findShareForUser(shareId, userId)
  if (!share) throw new UserFacingError('This shared summary no longer exists.', 'not_found')
  if (share.revoked_at) return share
  await revokeConsent(share.consent_id, userId, 'You revoked the shared health summary.')
  return (await shareRepo.findShareForUser(shareId, userId)) ?? share
}

export type PublicHealthShare =
  | { state: 'missing' }
  | { state: 'revoked' | 'expired' }
  | { state: 'open'; ciphertext: string; expiresAt: string; createdAt: string }

/**
 * Open a share from its link, for anyone holding it. Returns only what the
 * recipient's browser needs to decrypt and date it. The first view in an hour
 * is recorded in the owner's audit trail.
 */
export async function openHealthShare(id: string, now: Date = new Date()): Promise<PublicHealthShare> {
  const opened = await shareRepo.openShare(id)
  if (opened.state !== 'open') return { state: opened.state }

  const previous = opened.previousViewAt ? Date.parse(opened.previousViewAt) : NaN
  if (Number.isNaN(previous) || now.getTime() - previous >= VIEW_AUDIT_WINDOW_MS) {
    await createAuditEntry({
      userId: opened.userId,
      eventType: 'health_share_viewed',
      action: 'Someone opened a health summary you shared by link',
      consentId: opened.consentId,
      actorType: 'system',
      metadata: { healthShareId: id },
    }).catch((error) =>
      errorLogger.log(error, ErrorSeverity.LOW, { action: 'HEALTH_SHARE_VIEW_AUDIT_FAILED', metadata: { healthShareId: id } })
    )
  }

  return { state: 'open', ciphertext: opened.ciphertext, expiresAt: opened.expiresAt, createdAt: opened.createdAt }
}

/** Clear the ciphertext of shares past their expiry. The link already refuses them. */
export async function purgeExpiredHealthShares(now: Date = new Date()): Promise<number> {
  return shareRepo.clearExpiredShares(now)
}
