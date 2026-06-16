'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEncryption } from '@/lib/context/encryption-context'
import { useRouter } from 'next/navigation'

interface VaultUnlockDialogProps {
  open: boolean
  keySalt: string
  onClose: () => void
}

export function VaultUnlockDialog({ open, keySalt, onClose }: VaultUnlockDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { unlock } = useEncryption()
  const router = useRouter()

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await unlock(password, keySalt)
      onClose()
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Incorrect encryption password. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Unlock your vault</DialogTitle>
          <DialogDescription>
            You signed in with your passkey. Enter your encryption password to unlock your vault.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="encryption-password">Encryption password</Label>
            <Input
              id="encryption-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your encryption password"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? 'Unlocking...' : 'Unlock vault'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
