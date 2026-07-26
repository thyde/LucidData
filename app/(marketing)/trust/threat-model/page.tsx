import type { Metadata } from 'next'
import Link from 'next/link'
import { THREAT_MODEL, VULNERABILITY_DISCLOSURE } from '@/lib/constants/trust-disclosures'

export const metadata: Metadata = {
  title: 'Threat model | LucidData',
  description:
    'What each LucidData design decision protects against, and what it leaves exposed.',
}

export default function ThreatModelPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <Link href="/trust" className="text-sm text-muted-foreground hover:text-foreground">
        Back to the trust centre
      </Link>

      <header className="mt-4 space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">Threat model</h1>
        <p className="text-lg text-muted-foreground">
          Every mitigation leaves something behind. This page names both halves, because a
          threat model that only lists defences is marketing.
        </p>
      </header>

      <div className="mt-12 space-y-6">
        {THREAT_MODEL.map((row) => (
          <article key={row.threat} className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold">{row.threat}</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="font-medium">What protects you</dt>
                <dd className="mt-1 text-muted-foreground">{row.mitigation}</dd>
              </div>
              <div>
                <dt className="font-medium">What is still exposed</dt>
                <dd className="mt-1 text-muted-foreground">{row.residual}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <section className="mt-14 space-y-3">
        <h2 className="text-2xl font-semibold">Found something we missed</h2>
        <p className="text-muted-foreground">{VULNERABILITY_DISCLOSURE.policy}</p>
        <p>
          <a
            href={`mailto:${VULNERABILITY_DISCLOSURE.email}`}
            className="font-medium text-primary hover:underline"
          >
            {VULNERABILITY_DISCLOSURE.email}
          </a>
        </p>
      </section>
    </div>
  )
}
