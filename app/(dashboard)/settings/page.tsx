import { RegisterPasskeyButton } from '@/components/auth/register-passkey-button'
import { VaultExportButton } from '@/components/settings/vault-export-button'
import { RecoveryCodesSection } from '@/components/settings/recovery-codes-section'
import { RecoveryFactorsSection } from '@/components/settings/recovery-factors-section'
import { ChangePasswordForm } from '@/components/settings/change-password-form'
import { DeleteAccountDialog } from '@/components/settings/delete-account-dialog'
import { NotificationPreferences } from '@/components/settings/notification-preferences'
import { PrivacySignalSection } from '@/components/settings/privacy-signal-section'
import { ConnectedSources } from '@/components/settings/connected-sources'
import { SessionSecuritySection } from '@/components/settings/session-security-section'
import { TwoFactorSetup } from '@/components/settings/two-factor-setup'
import { PasskeyList } from '@/components/settings/passkey-list'
import { getAccountSecurity } from '@/lib/services/account.service'
import { getRecoveryStatus } from '@/lib/services/recovery-factor.service'
import { listSessions } from '@/lib/services/session-security.service'
import { getUniversalOptOut } from '@/lib/services/privacy-signal.service'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: passkeys }, security, optOut, recovery, sessions] = await Promise.all([
    supabase
      .from('passkeys')
      .select('id, device_name, created_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    getAccountSecurity(user.id),
    getUniversalOptOut(user.id),
    getRecoveryStatus(user.id),
    listSessions(user.id),
  ])

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, security, and data</p>
      </div>

      <ChangePasswordForm keySalt={security?.key_salt ?? null} />

      <RecoveryCodesSection
        keySalt={security?.key_salt ?? null}
        generatedAt={security?.recovery_codes_generated_at ?? null}
      />

      <RecoveryFactorsSection keySalt={security?.key_salt ?? null} initial={recovery} />

      <SessionSecuritySection initial={sessions} />

      <NotificationPreferences
        emailNotificationsEnabled={security?.email_notifications_enabled ?? true}
      />

      <PrivacySignalSection initial={optOut} />

      <ConnectedSources />

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Passkeys</h2>
        <p className="text-sm text-muted-foreground">
          Passkeys let you sign in without a password using your device biometrics or PIN.
        </p>

        <PasskeyList passkeys={passkeys ?? []} />

        <RegisterPasskeyButton />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          Add a second step at sign-in using an authenticator app, so a password alone is not enough
          to access your account.
        </p>
        <TwoFactorSetup />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Download a portable copy of your vault as JSON-LD. Entries are decrypted in your browser
          before the file is created.
        </p>
        <VaultExportButton />
      </section>

      <DeleteAccountDialog />
    </div>
  )
}
