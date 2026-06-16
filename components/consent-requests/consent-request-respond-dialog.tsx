'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { respondToConsentRequestAction } from '@/lib/actions/consent-request.actions'
import type { ConsentRequest } from '@/types/database.types'

type RequestWithOrg = ConsentRequest & { organization: { name: string; email: string } | null }

interface Props {
  open: boolean
  request: RequestWithOrg
  onClose: () => void
}

export function ConsentRequestRespondDialog({ open, request, onClose }: Props) {
  const [note, setNote] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ response, note }: { response: 'approved' | 'denied'; note?: string }) =>
      respondToConsentRequestAction(request.id, response, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consent-requests'] })
      onClose()
    },
  })

  const handleApprove = () => mutation.mutate({ response: 'approved', note: note || undefined })
  const handleDeny = () => mutation.mutate({ response: 'denied', note: note || undefined })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Respond to access request</DialogTitle>
          <DialogDescription>
            {request.organization?.name} is requesting {request.access_level} access to your data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md bg-muted p-4 space-y-2 text-sm">
            <p><span className="font-medium">From:</span> {request.organization?.name} ({request.organization?.email})</p>
            <p><span className="font-medium">Purpose:</span> {request.purpose}</p>
            <p><span className="font-medium">Access:</span> {request.access_level}</p>
            {request.data_category && (
              <p><span className="font-medium">Category:</span> {request.data_category}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="response-note">Note (optional)</Label>
            <Textarea
              id="response-note"
              placeholder="Add a note to accompany your response..."
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={handleDeny} disabled={mutation.isPending}>
            Deny
          </Button>
          <Button onClick={handleApprove} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
