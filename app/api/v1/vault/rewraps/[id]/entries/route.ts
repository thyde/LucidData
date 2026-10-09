import { v1, readJson } from '@/lib/api/v1/handler'
import { vaultRewrapPartSchema } from '@luciddata/core/validations/client-api'
import { stageVaultRewrap } from '@/lib/services/account.service'

export const dynamic = 'force-dynamic'

type Params = { id: string }

/** Add a part of a re-wrap. Sending an entry again replaces what was sent for it. */
export const POST = v1<Params>(async (req, { userId, params }) => {
  const { entries } = vaultRewrapPartSchema.parse(await readJson(req))
  return stageVaultRewrap(userId, params.id, entries)
})
