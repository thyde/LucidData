'use server'

import { createClient } from '@/lib/supabase/server'
import {
  getAllAuditLogs,
  getAuditLogs,
  verifyAuditChain,
  verifyUserAuditChain,
} from '@/lib/services/audit.service'
import type { AuditLog } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

/** The latest entries to show, and whether the whole chain, not just those, verifies. */
export async function getAuditLogsAction(): Promise<{ logs: AuditLog[]; chainValid: boolean }> {
  const userId = await getAuthenticatedUserId()
  const [logs, chainValid] = await Promise.all([getAuditLogs(userId), verifyUserAuditChain(userId)])
  return { logs, chainValid }
}

/** Every entry, for the person to keep, with the result of checking them. */
export async function exportAuditLogAction(): Promise<{ logs: AuditLog[]; chainValid: boolean }> {
  const userId = await getAuthenticatedUserId()
  const logs = await getAllAuditLogs(userId)
  return { logs, chainValid: verifyAuditChain(logs) }
}
