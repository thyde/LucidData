'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  acceptInvitationAction,
  previewInvitationAction,
} from '@/lib/actions/org-team.actions'
import { ORG_ROLE_DESCRIPTIONS } from '@/lib/validations/org-team'
import { unwrap } from '@/lib/actions/unwrap'
import type { InvitationPreview } from '@/lib/services/org-team.service'

/**
 * LD-603: accept an organization invitation. The token is only valid for the
 * invited address, so a forwarded link fails here rather than granting access.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter()
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    previewInvitationAction(token)
      .then((result) => {
        if (cancelled) return
        setPreview(result)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('This invitation could not be loaded.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  function accept() {
    setError(null)
    startTransition(async () => {
      try {
        const { organizationId } = await unwrap(acceptInvitationAction(token))
        router.push(`/org/${organizationId}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'This invitation could not be accepted.')
      }
    })
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading the invitation...</p>
  }

  if (!preview) {
    return (
      <div className="rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Invitation not available</h1>
        <p className="mt-2 text-muted-foreground">
          This invitation is invalid, already used, revoked, or expired. Ask the organization
          to send a new one.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-6">
      <h1 className="text-xl font-semibold">Join {preview.organizationName}</h1>
      <p className="mt-2 text-muted-foreground">
        You were invited as <span className="font-medium">{preview.role}</span>.{' '}
        {ORG_ROLE_DESCRIPTIONS[preview.role as keyof typeof ORG_ROLE_DESCRIPTIONS]}.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        This invitation was sent to {preview.email}. Sign in with that address to accept it.
      </p>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <Button className="mt-6" disabled={pending} onClick={accept}>
        Accept invitation
      </Button>
    </div>
  )
}
