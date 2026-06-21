import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConsentRequestList } from '@/components/consent-requests/consent-request-list'
import { CredentialRequestList } from '@/components/credential-requests/credential-request-list'

export default async function RequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-6 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Requests</h1>
        <p className="text-muted-foreground mt-1">
          Organizations asking you to share credentials or data
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Credential requests</h2>
          <p className="text-sm text-muted-foreground">
            Share verifiable credentials issued to you, like a degree or certification.
          </p>
        </div>
        <CredentialRequestList />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Data access requests</h2>
          <p className="text-sm text-muted-foreground">
            Grant or deny access to data stored in your vault.
          </p>
        </div>
        <ConsentRequestList />
      </section>
    </div>
  )
}
