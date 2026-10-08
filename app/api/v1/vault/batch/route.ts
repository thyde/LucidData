import { ZodError } from 'zod'
import { v1, readJson, zodIssues } from '@/lib/api/v1/handler'
import { vaultEntryBatchCreateSchema } from '@luciddata/core/validations/client-api'
import { createVaultData } from '@/lib/services/vault.service'
import { UserFacingError } from '@/lib/actions/action-result'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'

export const dynamic = 'force-dynamic'

/**
 * Store up to 100 encrypted entries, for an import. Each entry goes through
 * the same service as a single create and succeeds or fails on its own, so one
 * refusal does not hide which of the others were stored.
 */
export const POST = v1(async (req, { userId }) => {
  const { entries } = vaultEntryBatchCreateSchema.parse(await readJson(req))
  const results = []
  for (const [index, entry] of entries.entries()) {
    try {
      results.push({ index, data: await createVaultData(userId, entry) })
    } catch (error) {
      if (error instanceof UserFacingError) {
        results.push({ index, error: error.message, ...(error.code ? { code: error.code } : {}) })
      } else if (error instanceof ZodError) {
        // A rule the service checks that the request schema did not: the
        // client's mistake, not a fault worth retrying.
        results.push({
          index,
          error: 'This entry is not valid.',
          code: 'invalid_input',
          issues: zodIssues(error),
        })
      } else {
        errorLogger.log(error, ErrorSeverity.HIGH, { userId, action: 'API_V1_VAULT_BATCH' })
        results.push({ index, error: 'This entry could not be stored. Try again.', code: 'internal' })
      }
    }
  }
  return { stored: results.filter((result) => 'data' in result).length, results }
})
