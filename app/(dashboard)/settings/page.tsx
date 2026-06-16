import { RegisterPasskeyButton } from '@/components/auth/register-passkey-button'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: passkeys } = await supabase
    .from('passkeys')
    .select('id, device_name, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account security</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Passkeys</h2>
        <p className="text-sm text-muted-foreground">
          Passkeys let you sign in without a password using your device biometrics or PIN.
        </p>

        {passkeys && passkeys.length > 0 && (
          <div className="border rounded-md divide-y">
            {passkeys.map(pk => (
              <div key={pk.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{pk.device_name ?? 'Unnamed device'}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(pk.created_at).toLocaleDateString()}
                    {pk.last_used_at && ` · Last used ${new Date(pk.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <RegisterPasskeyButton />
      </section>
    </div>
  )
}
