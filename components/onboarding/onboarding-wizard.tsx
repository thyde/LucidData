'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, Vault, Handshake, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { completeOnboardingAction } from '@/lib/actions/account.actions'

interface OnboardingWizardProps {
  recoveryConfigured: boolean
}

interface Step {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
}

export function OnboardingWizard({ recoveryConfigured }: OnboardingWizardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState(0)
  const [finishing, setFinishing] = useState(false)

  const steps: Step[] = [
    {
      icon: <Sparkles className="h-6 w-6 text-primary" />,
      title: 'Welcome to Lucid',
      body: (
        <p>
          Lucid is your personal data bank. Your data is encrypted in your browser and only you hold
          the key. Here is how to get started.
        </p>
      ),
    },
    {
      icon: <ShieldCheck className="h-6 w-6 text-primary" />,
      title: 'Keep your recovery code safe',
      body: recoveryConfigured ? (
        <p>
          You got a recovery code when you signed up. It is the only way to restore your vault if you
          forget your password, so store it somewhere safe. You can regenerate it anytime in{' '}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>
          .
        </p>
      ) : (
        <p>
          You do not have a recovery code yet. Without one, resetting your password leaves your
          encrypted data unreadable. Set one up in{' '}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>
          .
        </p>
      ),
    },
    {
      icon: <Vault className="h-6 w-6 text-primary" />,
      title: 'Add your first data',
      body: (
        <p>
          Store anything in your{' '}
          <Link href="/vault" className="text-primary hover:underline">
            vault
          </Link>{' '}
          — identity, health, financial records. It is encrypted before it ever leaves your device.
        </p>
      ),
    },
    {
      icon: <Handshake className="h-6 w-6 text-primary" />,
      title: 'Share on your terms',
      body: (
        <p>
          Grant time-bound access with{' '}
          <Link href="/consent" className="text-primary hover:underline">
            consents
          </Link>
          , and choose what to license in the{' '}
          <Link href="/marketplace" className="text-primary hover:underline">
            marketplace
          </Link>
          . Every access is written to your audit log.
        </p>
      ),
    },
  ]

  const isLast = step === steps.length - 1
  const current = steps[step]

  async function finish() {
    setFinishing(true)
    try {
      await completeOnboardingAction()
      setOpen(false)
      router.refresh()
    } catch {
      // If it fails, let the wizard reappear next visit rather than trapping the user.
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mb-2">{current.icon}</div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">{current.body}</div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish} disabled={finishing}>
            Skip
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={finishing}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button onClick={finish} disabled={finishing}>
                {finishing ? 'Finishing…' : 'Get started'}
              </Button>
            ) : (
              <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
