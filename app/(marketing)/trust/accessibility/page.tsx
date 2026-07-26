import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ACCESSIBILITY_CONTACT,
  ACCESSIBILITY_STANDARD,
  ACCESSIBILITY_STATEMENT_DATE,
  CONFORMANCE_MEASURES,
  CONFORMANCE_SUMMARY,
  EVALUATION_METHOD,
  KNOWN_LIMITATIONS,
  STATEMENT_METADATA,
} from '@/lib/constants/accessibility'

export const metadata: Metadata = {
  title: 'Accessibility | LucidData',
  description:
    'How LucidData conforms to WCAG 2.2 Level AA, how that was evaluated, and every limitation known at the time of writing.',
}

export default function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm">
        <Link href="/trust" className="text-muted-foreground hover:underline">
          Trust centre
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>Accessibility</span>
      </nav>

      <h1 className="text-3xl font-semibold">Accessibility statement</h1>
      <p className="mt-4 text-lg text-muted-foreground">{CONFORMANCE_SUMMARY}</p>

      <section className="mt-12 space-y-4">
        <h2 className="text-2xl font-semibold">Scope and status</h2>
        <dl className="grid gap-4 rounded-lg border p-6 sm:grid-cols-[12rem_1fr]">
          <dt className="font-medium">Standard</dt>
          <dd className="text-muted-foreground">{ACCESSIBILITY_STANDARD}</dd>

          <dt className="font-medium">Conformance status</dt>
          <dd className="text-muted-foreground">{STATEMENT_METADATA.conformanceStatus}</dd>

          <dt className="font-medium">Scope</dt>
          <dd className="text-muted-foreground">{STATEMENT_METADATA.scope}</dd>

          <dt className="font-medium">Prepared on</dt>
          <dd className="text-muted-foreground">{ACCESSIBILITY_STATEMENT_DATE}</dd>

          <dt className="font-medium">Prepared by</dt>
          <dd className="text-muted-foreground">{STATEMENT_METADATA.preparedBy}</dd>
        </dl>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">How this was evaluated</h2>
        <p className="text-muted-foreground">
          Naming the method matters. An automated scan covers roughly a third of the standard,
          so a claim that rests on one alone is worth less than it sounds.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Evaluation methods and what each one covers</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Method
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  What it does
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  What it covers
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {EVALUATION_METHOD.map((entry) => (
                <tr key={entry.method}>
                  <td className="px-4 py-3 font-medium">{entry.method}</td>
                  <td className="px-4 py-3">{entry.detail}</td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.covers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Known limitations</h2>
        <p className="text-muted-foreground">
          These parts do not meet the standard. Each one names the surface, the criterion, and
          what happens next.
        </p>
        <ul className="space-y-4">
          {KNOWN_LIMITATIONS.map((limitation) => (
            <li key={limitation.area} className="rounded-lg border p-5">
              <h3 className="font-medium">{limitation.area}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Criterion: {limitation.criterion}
              </p>
              <p className="mt-2 text-sm">{limitation.detail}</p>
              <p className="mt-2 text-sm font-medium">{limitation.status}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">What has been done</h2>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          {CONFORMANCE_MEASURES.map((measure) => (
            <li key={measure}>{measure}</li>
          ))}
        </ul>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Tell us what is broken</h2>
        <p className="text-muted-foreground">{STATEMENT_METADATA.feedbackRoute}</p>
        <p>
          <a href={`mailto:${ACCESSIBILITY_CONTACT}`} className="font-medium text-primary underline">
            {ACCESSIBILITY_CONTACT}
          </a>
        </p>
        <p className="text-sm text-muted-foreground">{STATEMENT_METADATA.enforcement}</p>
      </section>
    </div>
  )
}
