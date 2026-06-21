'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getCredentialRequestsAction } from '@/lib/actions/credential-request.actions'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { VAULT_SCHEMA_TYPES } from '@/lib/schemas/vault-schemas'
import { FulfillCredentialRequestDialog } from './fulfill-credential-request-dialog'
import type { CredentialRequest } from '@/types/database.types'

type RequestWithOrg = CredentialRequest & { organization: { name: string; email: string } | null }

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  fulfilled: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-700',
}

function schemaLabel(type: string): string {
  return VAULT_SCHEMA_TYPES[type as keyof typeof VAULT_SCHEMA_TYPES]?.label ?? type
}

export function CredentialRequestList() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<RequestWithOrg | null>(null)

  const { data: requests, isLoading, error } = useQuery({
    queryKey: ['credential-requests'],
    queryFn: getCredentialRequestsAction,
  })

  // Realtime: surface new requests as organizations send them.
  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const channel = supabase
        .channel('credential-requests-realtime')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'credential_requests',
          filter: `user_id=eq.${user.id}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['credential-requests'] })
        })
        .subscribe()
      return channel
    }
    const channelPromise = getUser()
    return () => {
      channelPromise.then(ch => { if (ch) createClient().removeChannel(ch) })
    }
  }, [queryClient])

  if (isLoading) return <div className="text-muted-foreground">Loading credential requests...</div>
  if (error) return <div className="text-destructive">Failed to load credential requests</div>
  if (!requests?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No credential requests yet</p>
        <p className="text-sm mt-1">When organizations ask you to share verifiable credentials, they will appear here.</p>
      </div>
    )
  }

  const pending = requests.filter(r => r.status === 'pending')
  const rest = requests.filter(r => r.status !== 'pending')

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Awaiting your response</h2>
          <div className="space-y-3">
            {pending.map(request => (
              <RequestCard key={request.id} request={request} onRespond={() => setSelected(request)} />
            ))}
          </div>
        </section>
      )}
      {rest.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Past requests</h2>
          <div className="space-y-3">
            {rest.map(request => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        </section>
      )}
      {selected && (
        <FulfillCredentialRequestDialog
          open={!!selected}
          request={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function RequestCard({ request, onRespond }: { request: RequestWithOrg; onRespond?: () => void }) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{request.organization?.name ?? 'Unknown organization'}</p>
          <p className="text-sm text-muted-foreground">{request.organization?.email}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[request.status]}`}>
          {request.status}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        <p><span className="text-muted-foreground">Purpose:</span> {request.purpose}</p>
        <p>
          <span className="text-muted-foreground">Requested credentials:</span>{' '}
          {request.requested_schema_types.map(schemaLabel).join(', ')}
        </p>
        {request.message && (
          <p><span className="text-muted-foreground">Message:</span> {request.message}</p>
        )}
        <p><span className="text-muted-foreground">Requested:</span> {new Date(request.requested_at).toLocaleDateString()}</p>
        {request.expires_at && (
          <p><span className="text-muted-foreground">Expires:</span> {new Date(request.expires_at).toLocaleDateString()}</p>
        )}
      </div>
      {request.status === 'pending' && onRespond && (
        <Button size="sm" onClick={onRespond}>Review &amp; share</Button>
      )}
      {request.response_note && (
        <p className="text-sm text-muted-foreground italic">Your note: {request.response_note}</p>
      )}
    </div>
  )
}
