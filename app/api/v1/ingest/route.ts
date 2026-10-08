import { v1 } from '@/lib/api/v1/handler'
import { listPendingIngest } from '@/lib/services/ingestion.service'

export const dynamic = 'force-dynamic'

/**
 * Records a sync sealed to the person's ingestion key, up to 200 at a time.
 * The device opens them with the private half, stores them as vault entries,
 * then clears them.
 */
export const GET = v1(async (_req, { userId }) => listPendingIngest(userId))
