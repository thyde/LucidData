import { v1, readJson } from '@/lib/api/v1/handler'
import { keySaltClaimSchema } from '@luciddata/core/validations/client-api'
import { claimKeySalt } from '@/lib/services/account.service'

export const dynamic = 'force-dynamic'

/**
 * Record the salt for a new vault, once. The stored salt comes back, and it
 * differs from the one sent only if another device claimed first; the vault is
 * then opened with the stored one.
 */
export const POST = v1(async (req, { userId }) => {
  const { key_salt } = keySaltClaimSchema.parse(await readJson(req))
  return { key_salt: await claimKeySalt(userId, key_salt) }
})
