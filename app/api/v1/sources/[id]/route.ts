import { v1 } from '@/lib/api/v1/handler'
import { disconnectSource } from '@/lib/services/connector.service'

export const dynamic = 'force-dynamic'

/**
 * Disconnect a source. Pass `?delete_imported=true` to also delete the vault
 * entries imported from that provider.
 */
export const DELETE = v1<{ id: string }>(async (req, { userId, params }) => {
  const deleteImported = req.nextUrl.searchParams.get('delete_imported') === 'true'
  await disconnectSource(userId, params.id, { deleteImported })
  return { id: params.id, disconnected: true, deleted_imported: deleteImported }
})
