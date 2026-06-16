import { CredentialsInbox } from '@/components/credentials/credentials-inbox'

export default function CredentialsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Credentials</h1>
        <p className="text-muted-foreground mt-1">
          Verifiable credentials issued to you. Claim them to save an encrypted copy in your vault.
        </p>
      </div>
      <CredentialsInbox />
    </div>
  )
}
