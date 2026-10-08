import { v1, readJson, notFound } from '@/lib/api/v1/handler'
import { vaultEntryUpdateSchema } from '@luciddata/core/validations/client-api'
import {
  deleteVaultData,
  getVaultDataById,
  updateVaultData,
} from '@/lib/services/vault.service'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = v1<Params>(async (_req, { userId, params }) => {
  return (await getVaultDataById(params.id, userId)) ?? notFound()
})

// Update and delete find the entry themselves and answer not_found, which the
// wrapper turns into a 404. Looking it up here with getVaultDataById would also
// record a read the person never made.
export const PATCH = v1<Params>(async (req, { userId, params }) => {
  const input = vaultEntryUpdateSchema.parse(await readJson(req))
  return updateVaultData(params.id, userId, input)
})

export const DELETE = v1<Params>(async (_req, { userId, params }) => {
  await deleteVaultData(params.id, userId)
  return { id: params.id, deleted: true }
})
