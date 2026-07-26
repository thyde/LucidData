'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  getUniversalOptOut,
  overrideUniversalOptOut,
  recordUniversalOptOut,
  restoreUniversalOptOut,
  type UniversalOptOutState,
} from '@/lib/services/privacy-signal.service'
import { GPC_FORWARD_HEADER } from '@/lib/supabase/middleware'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

/**
 * Record a Global Privacy Control signal seen on the current request header.
 * Safe to call on every page load: the service only writes and audits the first
 * time the signal is seen.
 */
export async function recordGpcFromRequestAction(): Promise<void> {
  const requestHeaders = await headers()
  if (requestHeaders.get(GPC_FORWARD_HEADER) !== '1') return
  const userId = await getAuthenticatedUserId()
  await recordUniversalOptOut(userId, 'gpc_header')
}

/**
 * Record a signal detected from navigator.globalPrivacyControl, for browsers
 * that expose the property but whose header did not survive to the server.
 */
export async function recordGpcFromBrowserAction(): Promise<void> {
  const userId = await getAuthenticatedUserId()
  await recordUniversalOptOut(userId, 'gpc_navigator')
}

export async function getUniversalOptOutAction(): Promise<UniversalOptOutState> {
  const userId = await getAuthenticatedUserId()
  return getUniversalOptOut(userId)
}

/** The user deliberately allows sale and sharing despite the signal. */
export async function allowSaleDespiteSignalAction(): Promise<UniversalOptOutState> {
  const userId = await getAuthenticatedUserId()
  await overrideUniversalOptOut(userId)
  return getUniversalOptOut(userId)
}

/** The user asks us to honour the signal again. */
export async function honourSignalAgainAction(): Promise<UniversalOptOutState> {
  const userId = await getAuthenticatedUserId()
  await restoreUniversalOptOut(userId)
  return getUniversalOptOut(userId)
}
