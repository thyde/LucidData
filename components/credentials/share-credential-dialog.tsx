'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/hooks/use-toast'
import { createShareAction } from '@/lib/actions/share.actions'
import { SCHEMA_FORM_FIELDS } from '@/lib/schemas/form-fields'

interface ShareCredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  credentialId: string
  schemaType: string
  claims: Record<string, unknown>
}

export function ShareCredentialDialog({
  open,
  onOpenChange,
  credentialId,
  schemaType,
  claims,
}: ShareCredentialDialogProps) {
  const { toast } = useToast()

  // Prefer the schema's field order/labels; fall back to raw claim keys.
  const schemaFields = SCHEMA_FORM_FIELDS[schemaType] ?? []
  const availableKeys = schemaFields.length
    ? schemaFields.map((f) => f.name).filter((name) => name in claims)
    : Object.keys(claims)
  const labelFor = (key: string) =>
    schemaFields.find((f) => f.name === key)?.label ?? key

  const [selected, setSelected] = useState<Set<string>>(new Set(availableKeys))
  const [expiresInDays, setExpiresInDays] = useState('30')
  const [busy, setBusy] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleCreate() {
    setBusy(true)
    try {
      const { token } = await createShareAction(credentialId, [...selected], {
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      })
      const url = `${window.location.origin}/verify/${token}`
      setShareUrl(url)
      toast({ title: 'Share link created' })
    } catch (e) {
      toast({ title: 'Could not create share', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  function handleClose(next: boolean) {
    if (!next) setShareUrl(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share credential</DialogTitle>
          <DialogDescription>
            Choose which fields the verifier can see. They can verify the issuer&apos;s signature without seeing the rest.
          </DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Share this link:</p>
            <code className="block bg-muted border rounded p-3 text-xs break-all select-all">{shareUrl}</code>
            <Button
              variant="outline"
              onClick={() => { void navigator.clipboard.writeText(shareUrl); toast({ title: 'Copied' }) }}
            >
              Copy link
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fields to disclose</Label>
              <div className="space-y-1 border rounded-md p-3 max-h-56 overflow-auto">
                {availableKeys.length === 0 && (
                  <p className="text-sm text-muted-foreground">No fields available.</p>
                )}
                {availableKeys.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selected.has(key)}
                      onChange={() => toggle(key)}
                    />
                    {labelFor(key)}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-expiry">Expires in (days)</Label>
              <Input
                id="share-expiry"
                type="number"
                min="1"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {shareUrl ? (
            <Button onClick={() => handleClose(false)}>Done</Button>
          ) : (
            <Button onClick={handleCreate} disabled={busy || selected.size === 0}>
              {busy ? 'Creating…' : 'Create share link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
