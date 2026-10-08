import { v1, readJson } from '@/lib/api/v1/handler'
import { ingestClearSchema } from '@luciddata/core/validations/client-api'
import { clearPendingIngest } from '@/lib/services/ingestion.service'

export const dynamic = 'force-dynamic'

/** Drop sealed records the device has opened and stored. */
export const POST = v1(async (req, { userId }) => {
  const { ids } = ingestClearSchema.parse(await readJson(req))
  await clearPendingIngest(userId, ids)
  return { cleared: ids.length }
})
