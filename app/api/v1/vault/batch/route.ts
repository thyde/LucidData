import { v1, readJson } from '@/lib/api/v1/handler'
import { vaultEntryBatchCreateSchema } from '@luciddata/core/validations/client-api'
import { createVaultDataBatch } from '@/lib/services/vault.service'

export const dynamic = 'force-dynamic'

/**
 * Store up to 100 encrypted entries, for an import. Each entry succeeds or
 * fails on its own, so one refusal does not hide which of the others were
 * stored, and the web app's import goes through the same service.
 */
export const POST = v1(async (req, { userId }) => {
  const { entries } = vaultEntryBatchCreateSchema.parse(await readJson(req))
  const results = await createVaultDataBatch(userId, entries)
  return { stored: results.filter((result) => 'data' in result).length, results }
})
