import { v1, readJson } from '@/lib/api/v1/handler'
import { vaultRewrapApplySchema } from '@luciddata/core/validations/client-api'
import { applyVaultRewrap } from '@/lib/services/account.service'

export const dynamic = 'force-dynamic'

type Params = { id: string }

/**
 * Store every part in one transaction. Refused with code conflict unless each
 * entry the vault holds was sent once, re-wrapping the key that is stored now.
 */
export const POST = v1<Params>(async (req, { userId, params }) => {
  const { ingest_key } = vaultRewrapApplySchema.parse(await readJson(req).catch(() => ({})))
  const { rewrapped, retiredKits } = await applyVaultRewrap(userId, params.id, ingest_key)
  return { rewrapped, retired_kits: retiredKits }
})
