import { v1 } from '@/lib/api/v1/handler'
import { getCredentialRequestsForUser } from '@/lib/services/credential-request.service'

export const dynamic = 'force-dynamic'

/** Organizations' requests to see credentials the person holds. */
export const GET = v1(async (_req, { userId }) => getCredentialRequestsForUser(userId))
