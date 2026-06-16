'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuditLogs, verifyAuditChain } from '@/lib/services/audit.service'
import type { AuditLog } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export async function getAuditLogsAction(): Promise<{ logs: AuditLog[]; chainValid: boolean }> {
  const userId = await getAuthenticatedUserId()
  const logs = await getAuditLogs(userId)
  const chainValid = verifyAuditChain(logs)
  return { logs, chainValid }
}
