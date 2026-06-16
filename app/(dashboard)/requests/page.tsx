import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConsentRequestList } from '@/components/consent-requests/consent-request-list'

export default async function RequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Access Requests</h1>
        <p className="text-muted-foreground mt-1">
          Organizations requesting access to your data
        </p>
      </div>
      <ConsentRequestList />
    </div>
  )
}
