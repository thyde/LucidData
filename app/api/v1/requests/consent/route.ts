import { v1 } from '@/lib/api/v1/handler'
import { listConsentRequestsForUser } from '@/lib/services/consent-request.service'

export const dynamic = 'force-dynamic'

/** Organizations' requests for access to the person's data, newest first. */
export const GET = v1(async (_req, { userId }) => listConsentRequestsForUser(userId))
