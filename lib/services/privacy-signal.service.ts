import { createServiceClient } from '@/lib/supabase/service'
import { createAuditEntry } from '@/lib/services/audit.service'

/**
 * LD-302 universal opt-out signal handling.
 *
 * Global Privacy Control is a browser-level "do not sell or share" signal.
 * Several US state laws require honouring it, and honouring it is also the
 * position this product argues for, so it is enforced rather than displayed.
 *
 * The signal is recorded once. Repeat requests carrying the same header must not
 * write another audit entry, or every page load would pollute the chain.
 */

export type OptOutSource = 'gpc_header' | 'gpc_navigator'

export interface UniversalOptOutState {
  optedOut: boolean
  source: string | null
  detectedAt: string | null
  /** Set when the user deliberately opted back in after a signal was seen. */
  overriddenAt: string | null
}

const EMPTY: UniversalOptOutState = {
  optedOut: false,
  source: null,
  detectedAt: null,
  overriddenAt: null,
}

export async function getUniversalOptOut(userId: string): Promise<UniversalOptOutState> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('users')
    .select(
      'universal_opt_out, universal_opt_out_source, universal_opt_out_at, universal_opt_out_override_at'
    )
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return EMPTY

  return {
    optedOut: data.universal_opt_out,
    source: data.universal_opt_out_source,
    detectedAt: data.universal_opt_out_at,
    overriddenAt: data.universal_opt_out_override_at,
  }
}

/**
 * Record a detected opt-out signal. Idempotent: if the flag is already set, or
 * the user has explicitly overridden it, nothing is written and no audit entry
 * is created.
 *
 * Returns true only when this call is what flipped the flag.
 */
export async function recordUniversalOptOut(
  userId: string,
  source: OptOutSource
): Promise<boolean> {
  const current = await getUniversalOptOut(userId)
  if (current.optedOut) return false
  // A deliberate opt-in wins until the user changes it back themselves.
  if (current.overriddenAt) return false

  const now = new Date().toISOString()
  const service = createServiceClient()
  const { error } = await service
    .from('users')
    .update({
      universal_opt_out: true,
      universal_opt_out_source: source,
      universal_opt_out_at: now,
    })
    .eq('id', userId)
    .eq('universal_opt_out', false)
  if (error) throw error

  await createAuditEntry({
    userId,
    eventType: 'universal_opt_out_detected',
    action: 'Detected a universal opt-out signal and stopped data sale and sharing',
    actorType: 'system',
    metadata: { source },
  })

  return true
}

/**
 * The user deliberately opts back in after a signal was detected. Recorded as a
 * distinct event so it is never mistaken for the signal simply going away.
 */
export async function overrideUniversalOptOut(userId: string): Promise<void> {
  const now = new Date().toISOString()
  const service = createServiceClient()
  const { error } = await service
    .from('users')
    .update({
      universal_opt_out: false,
      universal_opt_out_override_at: now,
    })
    .eq('id', userId)
  if (error) throw error

  await createAuditEntry({
    userId,
    eventType: 'universal_opt_out_overridden',
    action: 'Chose to allow data sale and sharing despite a universal opt-out signal',
    metadata: { overridden_at: now },
  })
}

/** Clear an override so the browser signal is honoured again. */
export async function restoreUniversalOptOut(userId: string): Promise<void> {
  const now = new Date().toISOString()
  const service = createServiceClient()
  const { error } = await service
    .from('users')
    .update({
      universal_opt_out: true,
      universal_opt_out_source: 'gpc_navigator',
      universal_opt_out_at: now,
      universal_opt_out_override_at: null,
    })
    .eq('id', userId)
  if (error) throw error

  await createAuditEntry({
    userId,
    eventType: 'universal_opt_out_restored',
    action: 'Restored the universal opt-out and stopped data sale and sharing',
    metadata: { restored_at: now },
  })
}

/** Throws when the user has an active universal opt-out. */
export async function assertNotUniversallyOptedOut(userId: string): Promise<void> {
  const state = await getUniversalOptOut(userId)
  if (state.optedOut) {
    throw new Error(
      'Your browser sends a universal opt-out signal, so your data is not offered for sale or sharing. You can change this in settings.'
    )
  }
}

/**
 * Parse a Global Privacy Control request header. Only the exact value "1" means
 * opted out, per the specification.
 */
export function parseGpcHeader(value: string | null | undefined): boolean {
  return value?.trim() === '1'
}
