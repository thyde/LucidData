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
import { StepUpDialog } from '@/components/auth/step-up-dialog'
import { DELETE_CONFIRM_PHRASE } from '@/lib/validations/account'
import type { DeletionReceiptSummary } from '@/lib/services/account.service'
import { unwrap } from '@/lib/actions/unwrap'

// Save the receipt locally. Best-effort: a blocked download must not leave the
// person unsure whether their account was actually deleted.
function downloadReceipt(summary: DeletionReceiptSummary) {
  try {
    const blob = new Blob([JSON.stringify(summary, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `luciddata-deletion-receipt-${summary.receipt.receiptId}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch {
    // Nothing to recover here; the account is already gone.
  }
}

export function DeleteAccountDialog() {
  const router = useRouter()
  const { toast } = useToast()
  const { lock } = useEncryption()
  const [open, setOpen] = useState(false)
  const [stepUpOpen, setStepUpOpen] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)

  function requestDelete(e: React.FormEvent) {
    e.preventDefault()
    // LD-106: an active session is not enough to destroy an account.
    setOpen(false)
    setStepUpOpen(true)
  }

  async function handleDelete(stepUpToken: string) {
    setBusy(true)
    try {
      const summary = await unwrap(deleteAccountAction({ confirmPhrase: phrase, stepUpToken }))
      // LD-607: hand over the signed proof before the session ends. It is the
      // only copy the person gets, and it is what makes "deleted" checkable.
      downloadReceipt(summary)
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
      <p className="text-sm text-muted-foreground">
        You will get a signed deletion receipt listing what was removed and what a payment
        provider still has to keep. Anyone can check the signature.
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
          <form onSubmit={requestDelete} className="space-y-4">
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
              {busy ? 'Deleting...' : 'Permanently delete account'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <StepUpDialog
        action="delete_account"
        title="Confirm your password"
        description="Deleting your account erases everything, so we ask for your password one more time."
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onConfirmed={handleDelete}
      />
    </section>
  )
}
