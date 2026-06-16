import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/auth/sign-out-button'

export default async function OrgLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?redirectedFrom=/org')
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link href="/org" className="flex items-center gap-3">
            <span className="font-semibold text-lg">Lucid</span>
            <span className="text-muted-foreground text-sm">for Organizations</span>
          </Link>
          <SignOutButton className="text-sm text-muted-foreground hover:text-foreground" />
        </div>
      </header>
      <main className="max-w-3xl mx-auto py-12 px-6">
        {children}
      </main>
    </div>
  )
}
