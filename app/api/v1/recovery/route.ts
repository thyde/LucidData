import { v1 } from '@/lib/api/v1/handler'
import { getRecoveryStatus } from '@/lib/services/recovery-factor.service'

export const dynamic = 'force-dynamic'

/**
 * The person's recovery factors, and whether the vault may be written yet.
 * A new vault refuses its first entry until it has a factor or the person has
 * declined one.
 */
export const GET = v1(async (_req, { userId }) => getRecoveryStatus(userId))
