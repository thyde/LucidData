'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MfaChallenge } from '@/components/auth/mfa-challenge'
import { SignOutButton } from '@/components/auth/sign-out-button'

function TwoFactorInner() {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = params.get('redirectedFrom') || '/dashboard'

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Two-factor authentication</CardTitle>
        <CardDescription className="text-center">
          Enter the 6-digit code from your authenticator app to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MfaChallenge
          onVerified={() => {
            router.replace(redirectTo)
            router.refresh()
          }}
        />
        <div className="text-center">
          <SignOutButton className="text-sm text-muted-foreground hover:text-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function TwoFactorPage() {
  return (
    <Suspense
      fallback={<p className="text-center text-sm text-muted-foreground">Loading…</p>}
    >
      <TwoFactorInner />
    </Suspense>
  )
}
