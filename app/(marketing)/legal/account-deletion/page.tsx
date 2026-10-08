import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalList, LegalSection, Mail } from '@/components/legal/legal-document'
import { PRIVACY_CONTACT } from '@/lib/constants/legal'
import { RESIDUAL_DISCLOSURES } from '@/lib/constants/deletion-manifest'
import { BACKUP_RETENTION_DAYS } from '@/lib/constants/retention'

export const metadata: Metadata = {
  title: 'Delete your account | LucidData',
  description: 'How to delete your LucidData account and data, and what remains afterwards.',
}

export default function AccountDeletionPage() {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-16">
      <Link href="/legal" className="text-sm text-muted-foreground hover:text-foreground">
        All legal documents
      </Link>
      <header className="mt-4 space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Delete your account</h1>
        <p className="text-lg text-muted-foreground">
          You can delete your LucidData account and the data in it at any time, from the website
          or the app.
        </p>
      </header>

      <div className="mt-12 space-y-12">
        <LegalSection title="Delete it yourself">
          <p>
            Sign in, open Settings, choose Delete account, and confirm with your password. Your
            account is deleted straight away, and you get a signed receipt that lists what was
            removed.
          </p>
        </LegalSection>

        <LegalSection title="If you cannot sign in">
          <p>
            Email <Mail address={PRIVACY_CONTACT} /> from the address on your account. We will reply
            to that address to confirm the request, and delete the account within 30 days of your
            confirmation.
          </p>
        </LegalSection>

        <LegalSection title="What is deleted">
          <p>
            Your vault, your connected services and their access tokens, your grants and the
            requests sent to you, credentials issued to you, your marketplace contributions, your
            notifications, your audit log, and your account details. Our daily backups are kept
            for {BACKUP_RETENTION_DAYS} days, so deleted data is gone from them within{' '}
            {BACKUP_RETENTION_DAYS} days.
          </p>
        </LegalSection>

        <LegalSection title="What remains">
          <LegalList>
            {RESIDUAL_DISCLOSURES.map((residual) => (
              <li key={residual.what}>
                {residual.holder}: {residual.what}. {residual.why}
              </li>
            ))}
          </LegalList>
        </LegalSection>

        <LegalSection title="Delete some data and keep your account">
          <p>
            Delete entries one at a time in your vault. Disconnect a service, or withdraw your
            consent to store health data, in Settings. Revoke a grant on the Consents page.
          </p>
        </LegalSection>
      </div>
    </article>
  )
}
