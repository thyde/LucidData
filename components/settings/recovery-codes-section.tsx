'use client'

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { setupRecoveryFromPassword } from '@/lib/account/account-crypto'
import { RecoveryCodeDisplay } from '@/components/settings/recovery-code-display'

interface RecoveryCodesSectionProps {
  keySalt: string | null
  generatedAt: string | null
}

export function RecoveryCodesSection({ keySalt, generatedAt }: RecoveryCodesSectionProps) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<string | null>(null)

  function reset() {
    setPassword('')
    setError(null)
    setCode(null)
    setBusy(false)
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!keySalt) {
      setError('Your encryption key is not set up. Add a vault entry first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Not signed in')

      // Verify the password before escrowing a key derived from it.
      const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password })
      if (authError) {
        setError('Incorrect password')
        return
      }

      const newCode = await setupRecoveryFromPassword(password, keySalt)
      setCode(newCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a recovery code')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Recovery code</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        A recovery code lets you unlock your vault again if you ever reset your password. Without
        it, resetting your password leaves your encrypted data unreadable.
      </p>
      <p className="text-sm">
        {generatedAt
          ? `Recovery code set up on ${new Date(generatedAt).toLocaleDateString()}.`
          : 'No recovery code yet.'}
      </p>
      <Button
        variant="outline"
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        {generatedAt ? 'Regenerate recovery code' : 'Generate recovery code'}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{code ? 'Save your recovery code' : 'Generate a recovery code'}</DialogTitle>
            <DialogDescription>
              {code
                ? 'Store this somewhere safe. It replaces any previous code and is shown only once.'
                : 'Confirm your password to generate a recovery code.'}
            </DialogDescription>
          </DialogHeader>

          {code ? (
            <div className="space-y-4">
              <RecoveryCodeDisplay code={code} />
              <Button className="w-full" onClick={() => setOpen(false)}>
                I have saved my code
              </Button>
            </div>
          ) : (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-password">Password</Label>
                <Input
                  id="recovery-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy || !password}>
                {busy ? 'Generating…' : 'Generate code'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
