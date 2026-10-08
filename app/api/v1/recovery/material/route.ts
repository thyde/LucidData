import { v1 } from '@/lib/api/v1/handler'
import { getRecoveryMaterial } from '@/lib/services/recovery-factor.service'

export const dynamic = 'force-dynamic'

/**
 * What the device needs to open the vault with a recovery code or kit after a
 * password reset: the key salt, each wrapped copy of the master key, and one
 * entry's wrapped data key to test a copy against. Only wrapped bytes leave the
 * server, each sealed under a secret it never sees.
 */
export const GET = v1(async (_req, { userId }) => getRecoveryMaterial(userId))
