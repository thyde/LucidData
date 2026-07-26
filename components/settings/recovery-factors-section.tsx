'use client'

import { useState, useTransition } from 'react'
import { KeyRound } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RecoveryCodeDisplay } from '@/components/settings/recovery-code-display'
import { createClient } from '@/lib/supabase/client'
import { verifyPassword } from '@/lib/supabase/verify-password'
import { createRecoveryKitFromPassword } from '@/lib/account/account-crypto'
import {
  confirmRecoveryFactorAction,
  declineRecoverySetupAction,
  getRecoveryStatusAction,
  removeRecoveryFactorAction,
} from '@/lib/actions/recovery.actions'
import { formatDate } from '@/lib/utils/date-formatter'
import type { RecoveryStatus } from '@/lib/services/recovery-factor.service'

const TYPE_LABEL: Record<string, string> = {
  recovery_code: 'Recovery code',
  recovery_kit: 'Recovery kit',
}

/**
 * LD-105: manage independent recovery factors.
 *
 * More than one factor can exist, because the most common real-world failure is
 * losing the single thing that could have opened the vault. Every secret here is
 * generated in the browser; the server only ever holds wrapped bytes.
 */
export function RecoveryFactorsSection({
  keySalt,
  initial,
}: {
  keySalt: string | null
  initial: RecoveryStatus
}) {
  const [status, setStatus] = useState(initial)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('Backup kit')
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()

  function reset() {
    setPassword('')
    setSecret(null)
    setError(null)
    setBusy(false)
  }

  function refresh() {
    startTransition(async () => {
      try {
        setStatus(await getRecoveryStatusAction())
      } catch {
        setError('The recovery status could not be refreshed.')
      }
    })
  }

  async function createKit(event: React.FormEvent) {
    event.preventDefault()
    if (!keySalt) {
      setError('Your encryption key is not set up yet. Add a vault entry first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Not signed in')

      if (!(await verifyPassword(user.email, password))) {
        setError('Incorrect password')
        return
      }

      setSecret(await createRecoveryKitFromPassword(password, keySalt, label))
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The recovery kit could not be created.')
    } finally {
      setBusy(false)
    }
  }

  function download() {
    if (!secret) return
    const blob = new Blob(
      [
        [
          'LucidData recovery kit',
          '',
          'Keep this secret somewhere separate from your password.',
          'Anyone who has it, together with a password reset, can open your vault.',
          'LucidData cannot recover your vault without it or your recovery code.',
          '',
          secret,
          '',
        ].join('\n'),
      ],
      { type: 'text/plain' }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'luciddata-recovery-kit.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Recovery factors</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        We hold no key to your vault, so a recovery factor is the only way back in after a
        password reset. Keeping more than one means losing a single thing is not fatal.
      </p>

      {status.factors.length === 0 && !status.declinedAt && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          You have no recovery factor. If you forget your password, your vault becomes
          permanently unreadable, and nobody, including us, can restore it.
        </div>
      )}

      {status.confirmationDue && (
        <div className="rounded-lg border p-4 text-sm">
          It has been a while since you confirmed you still have a recovery factor. Check that
          you can find it, then confirm below.
        </div>
      )}

      {status.factors.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {status.factors.map((factor) => (
            <li
              key={factor.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">
                  {TYPE_LABEL[factor.type] ?? factor.type}
                  {factor.label && factor.label !== TYPE_LABEL[factor.type]
                    ? ` · ${factor.label}`
                    : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  Added {formatDate(factor.createdAt)}
                  {factor.lastConfirmedAt
                    ? ` · confirmed ${formatDate(factor.lastConfirmedAt)}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await confirmRecoveryFactorAction({ factorId: factor.id })
                      refresh()
                    })
                  }
                >
                  I still have this
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await removeRecoveryFactorAction({ factorId: factor.id })
                      refresh()
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            reset()
            setOpen(true)
          }}
        >
          Add a recovery kit
        </Button>
        {status.factors.length === 0 && !status.declinedAt && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await declineRecoverySetupAction()
                refresh()
              })
            }
          >
            Continue without recovery
          </Button>
        )}
      </div>

      {status.declinedAt && status.factors.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You chose to continue without a recovery factor on {formatDate(status.declinedAt)}. Your
          vault cannot be recovered if you forget your password.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{secret ? 'Save your recovery kit' : 'Create a recovery kit'}</DialogTitle>
            <DialogDescription>
              {secret
                ? 'Store this somewhere separate from your password. It is shown only once.'
                : 'Confirm your password to create a second, independent way back into your vault.'}
            </DialogDescription>
          </DialogHeader>

          {secret ? (
            <div className="space-y-4">
              <RecoveryCodeDisplay code={secret} />
              <Button variant="outline" className="w-full" onClick={download}>
                Download as a file
              </Button>
              <Button className="w-full" onClick={() => setOpen(false)}>
                I have saved my kit
              </Button>
            </div>
          ) : (
            <form onSubmit={createKit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="kit-label">Label</Label>
                <Input
                  id="kit-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Backup kit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kit-password">Password</Label>
                <Input
                  id="kit-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Creating...' : 'Create recovery kit'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
