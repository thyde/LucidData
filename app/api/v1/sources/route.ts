import { v1 } from '@/lib/api/v1/handler'
import { availableConnectors, listSources } from '@/lib/services/connector.service'

export const dynamic = 'force-dynamic'

/** The providers that can be connected, and the person's connected sources. */
export const GET = v1(async (_req, { userId }) => ({
  available: availableConnectors(),
  connected: await listSources(userId),
}))
