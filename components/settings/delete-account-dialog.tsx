'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'
import { useEncryption } from '@/lib/context/encryption-context'
import { createClient } from '@/lib/supabase/client'
import { deleteAccountAction } from '@/lib/actions/account.actions'
import { DELETE_CONFIRM_PHRASE } from '@/lib/validations/account'

export function DeleteAccountDialog() {
  const router = useRouter()
  const { toast } = useToast()
  const { lock } = useEncryption()
  const [open, setOpen] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await deleteAccountAction({ confirmPhrase: phrase })
      lock()
      try {
        await createClient().auth.signOut()
      } catch {
        // Session is already gone once the auth user is deleted.
      }
      router.push('/')
      router.refresh()
    } catch (err) {
      toast({
        title: 'Could not delete account',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-destructive/40 p-4">
      <div className="flex items-center gap-2">
        <Trash2 className="h-5 w-5 text-destructive" />
        <h2 className="text-lg font-medium text-destructive">Delete account</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Permanently delete your account and all vault data, consents, credentials, and audit
        history. This cannot be undone. Export your data first if you want a copy.
      </p>
      <Button
        variant="destructive"
        onClick={() => {
          setPhrase('')
          setOpen(true)
        }}
      >
        Delete my account
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently erases everything. Type <span className="font-mono">{DELETE_CONFIRM_PHRASE}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDelete} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">Confirmation</Label>
              <Input
                id="delete-confirm"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={DELETE_CONFIRM_PHRASE}
                autoFocus
              />
            </div>
            <Button
              type="submit"
              variant="destructive"
              className="w-full"
              disabled={busy || phrase !== DELETE_CONFIRM_PHRASE}
            >
              {busy ? 'Deleting…' : 'Permanently delete account'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
