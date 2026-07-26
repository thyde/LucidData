'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/lib/hooks/use-toast'
import { removePasskeyAction } from '@/lib/actions/account.actions'

interface PasskeySummary {
  id: string
  device_name: string | null
  created_at: string
  last_used_at: string | null
}

export function PasskeyList({ passkeys }: { passkeys: PasskeySummary[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = useState<PasskeySummary | null>(null)
  const [isPending, startTransition] = useTransition()

  if (passkeys.length === 0) return null

  function removeSelected() {
    if (!selected) return
    startTransition(async () => {
      try {
        await removePasskeyAction({ passkeyId: selected.id })
        toast({ title: 'Passkey removed' })
        setSelected(null)
        router.refresh()
      } catch (error) {
        toast({
          title: 'Could not remove passkey',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <>
      <div className="divide-y rounded-md border">
        {passkeys.map((passkey) => (
          <div key={passkey.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium">{passkey.device_name ?? 'Unnamed device'}</p>
              <p className="text-xs text-muted-foreground">
                Added {new Date(passkey.created_at).toLocaleDateString()}
                {passkey.last_used_at &&
                  ` · Last used ${new Date(passkey.last_used_at).toLocaleDateString()}`}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${passkey.device_name ?? 'unnamed passkey'}`}
              onClick={() => setSelected(passkey)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.device_name ?? 'This device'} will no longer be able to sign in with its
              passkey. Password sign-in and your other passkeys will continue to work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={removeSelected}>
              {isPending ? 'Removing…' : 'Remove passkey'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}