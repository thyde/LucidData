import { v1, readJson } from '@/lib/api/v1/handler'
import { vaultRewrapSchema } from '@luciddata/core/validations/client-api'
import { rewrapVaultEntries } from '@/lib/services/account.service'

export const dynamic = 'force-dynamic'

/**
 * Store every entry's data key re-wrapped under a new master key, after a
 * password change or a recovery. Needs a step-up grant for change_password.
 * Every recovery factor wraps the old key, so all of them are retired; the
 * device should store a new recovery code straight after.
 */
export const POST = v1(async (req, { userId }) => {
  const { reason, entries, step_up_token, ingest_key } = vaultRewrapSchema.parse(await readJson(req))
  const { retiredKits, retiredPasskeys } = await rewrapVaultEntries(userId, reason, entries, step_up_token, ingest_key)
  return { rewrapped: entries.length, retired_kits: retiredKits, retired_passkeys: retiredPasskeys }
})
