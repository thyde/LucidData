'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { getConsentRequestsAction, respondToConsentRequestAction } from '@/lib/actions/consent-request.actions'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ConsentRequestRespondDialog } from './consent-request-respond-dialog'
import type { ConsentRequest } from '@/types/database.types'

type RequestWithOrg = ConsentRequest & { organization: { name: string; email: string } | null }

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-700',
}

export function ConsentRequestList() {
  const queryClient = useQueryClient()
  const [selectedRequest, setSelectedRequest] = useState<RequestWithOrg | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: requests, isLoading, error } = useQuery({
    queryKey: ['consent-requests'],
    queryFn: getConsentRequestsAction,
  })

  // Realtime subscription for new requests
  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const channel = supabase
        .channel('consent-requests-realtime')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'consent_requests',
          filter: `user_id=eq.${user.id}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['consent-requests'] })
        })
        .subscribe()
      return channel
    }
    const channelPromise = getUser()
    return () => {
      channelPromise.then(ch => { if (ch) createClient().removeChannel(ch) })
    }
  }, [queryClient])

  if (isLoading) return <div className="text-muted-foreground">Loading requests...</div>
  if (error) return <div className="text-destructive">Failed to load requests</div>
  if (!requests?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No access requests yet</p>
        <p className="text-sm mt-1">When organizations request access to your data, they will appear here.</p>
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
              <RequestCard
                key={request.id}
                request={request}
                onRespond={() => { setSelectedRequest(request); setDialogOpen(true) }}
              />
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
      {selectedRequest && (
        <ConsentRequestRespondDialog
          open={dialogOpen}
          request={selectedRequest}
          onClose={() => { setDialogOpen(false); setSelectedRequest(null) }}
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
          <p className="font-medium">{request.organization?.name ?? 'Unknown Organization'}</p>
          <p className="text-sm text-muted-foreground">{request.organization?.email}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[request.status]}`}>
          {request.status}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        <p><span className="text-muted-foreground">Purpose:</span> {request.purpose}</p>
        {request.data_category && (
          <p><span className="text-muted-foreground">Data category:</span> {request.data_category}</p>
        )}
        <p><span className="text-muted-foreground">Access level:</span> {request.access_level}</p>
        <p><span className="text-muted-foreground">Requested:</span> {new Date(request.requested_at).toLocaleDateString()}</p>
        {request.expires_at && (
          <p><span className="text-muted-foreground">Request expires:</span> {new Date(request.expires_at).toLocaleDateString()}</p>
        )}
      </div>
      {request.status === 'pending' && onRespond && (
        <Button size="sm" onClick={onRespond}>Review & Respond</Button>
      )}
      {request.response_note && (
        <p className="text-sm text-muted-foreground italic">Your note: {request.response_note}</p>
      )}
    </div>
  )
}
