import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listCases } from '@/lib/services/rights.service'
import { RightsRequests } from '@/components/settings/rights-requests'

export const metadata: Metadata = {
  title: 'Your privacy rights | LucidData',
  description:
    'File an access, correction, deletion, restriction, or portability request, track its deadline, and appeal a refusal.',
}

export default async function PrivacyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cases = await listCases(user.id)

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Your privacy rights</h1>
        <p className="text-muted-foreground">
          Ask us to show, correct, delete, restrict, or hand over your data. Every request gets
          a deadline set by where you live, and every step we take is recorded where you can
          read it.
        </p>
      </header>

      <RightsRequests cases={cases} />
    </div>
  )
}
