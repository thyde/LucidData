/**
 * LD-607 retention windows.
 *
 * Every value here is a promise: after this long, the record is gone. Keep them
 * short enough to be meaningful and long enough that a person can still see
 * what happened to them recently.
 *
 * The clock for each window is stated next to it, because "90 days" is
 * meaningless without saying 90 days from what.
 */

/** Answered or expired consent requests, from the moment they stopped being live. */
export const CONSENT_REQUEST_RETENTION_DAYS = 90

/** Answered or expired credential requests, from the moment they stopped being live. */
export const CREDENTIAL_REQUEST_RETENTION_DAYS = 90

/** Share tokens, from the moment they expired or were revoked. */
export const SHARE_RETENTION_DAYS = 30

/** In-app notifications, from when they were created. */
export const NOTIFICATION_RETENTION_DAYS = 180

/**
 * Grace after a dataset export window closes before the exported records are
 * destroyed. Short, because the buyer already had their download window.
 */
export const EXPORT_GRACE_DAYS = 1

export const DAY_MS = 24 * 60 * 60 * 1000

export function cutoffIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString()
}
