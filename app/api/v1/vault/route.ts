import { v1, readJson } from '@/lib/api/v1/handler'
import { vaultEntryCreateSchema } from '@luciddata/core/validations/client-api'
import { createVaultData, getUserVaultData } from '@/lib/services/vault.service'

export const dynamic = 'force-dynamic'

/** Every entry, encrypted. The device decrypts with the person's master key. */
export const GET = v1(async (_req, { userId }) => getUserVaultData(userId))

/** Store one entry the device has already encrypted. */
export const POST = v1(
  async (req, { userId }) => createVaultData(userId, vaultEntryCreateSchema.parse(await readJson(req))),
  { status: 201 }
)
