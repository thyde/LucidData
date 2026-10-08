import type { Metadata } from 'next'
import Link from 'next/link'
import { formatLegalDate } from '@/components/legal/legal-document'
import { ACCOUNT_DELETION_PATH, LEGAL_DOCUMENTS } from '@/lib/constants/legal'

export const metadata: Metadata = {
  title: 'Legal | LucidData',
  description: 'The terms and policies that apply when you use LucidData.',
}

export default function LegalIndexPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Legal</h1>
        <p className="text-lg text-muted-foreground">
          The terms and policies that apply when you use LucidData. The{' '}
          <Link href="/trust" className="text-primary underline">
            trust centre
          </Link>{' '}
          shows how the system behind them works.
        </p>
      </header>

      <ul className="mt-12 space-y-4">
        {Object.values(LEGAL_DOCUMENTS).map((document) => (
          <li key={document.id} className="rounded-lg border p-5">
            <h2 className="text-lg font-semibold">
              <Link href={document.path} className="text-primary underline">
                {document.title}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {document.summary} In effect from{' '}
              <time dateTime={document.version}>{formatLegalDate(document.version)}</time>.
            </p>
          </li>
        ))}
        <li className="rounded-lg border p-5">
          <h2 className="text-lg font-semibold">
            <Link href={ACCOUNT_DELETION_PATH} className="text-primary underline">
              Delete your account
            </Link>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How to delete your account and data, and what remains afterwards.
          </p>
        </li>
      </ul>
    </div>
  )
}
