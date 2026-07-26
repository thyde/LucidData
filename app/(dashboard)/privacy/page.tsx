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

/**
 * LD-206: a collector detected by the extension can be escalated here in one
 * action. The name arrives as a query parameter and only ever reaches the
 * detail field of a draft, which the person still has to read and submit.
 */
function collectorFrom(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  // A company name, not free text. Anything else is dropped rather than
  // rendered, because this string is attacker-controlled by construction.
  const trimmed = raw.trim().slice(0, 60)
  return /^[A-Za-z0-9 .&'-]+$/.test(trimmed) ? trimmed : null
}

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ collector?: string | string[] }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cases = await listCases(user.id)
  const collector = collectorFrom((await searchParams).collector)

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

      <RightsRequests cases={cases} collector={collector} />
    </div>
  )
}
