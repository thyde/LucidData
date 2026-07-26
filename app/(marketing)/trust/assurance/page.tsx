import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AVAILABILITY_TARGET,
  BREACH_NOTIFICATION_TEMPLATE,
  CONTINUITY,
  DATA_RESIDENCY,
  INCIDENT_ROLES,
  INCIDENT_STEPS,
  PROCESSING_TERMS,
  PROCUREMENT_CONTACT,
  RECOVERY_OBJECTIVES,
  RECOVERY_TESTING_STATEMENT,
  RESIDENCY_SUMMARY,
  SECURITY_QUESTIONNAIRE,
  SUPPORT_CONTACT,
  SUPPORT_HOURS,
  SUPPORT_SEVERITIES,
} from '@/lib/constants/assurance'
import { SUBPROCESSORS } from '@/lib/constants/trust-disclosures'

export const metadata: Metadata = {
  title: 'Assurance and procurement | LucidData',
  description:
    'Processing terms, support commitments, data residency, recovery objectives, incident response, and answers to the standard security questionnaire.',
}

export default function AssurancePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <nav className="mb-8 text-sm">
        <Link href="/trust" className="text-muted-foreground hover:underline">
          Trust centre
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>Assurance and procurement</span>
      </nav>

      <h1 className="text-3xl font-semibold">Assurance and procurement</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Everything a legal or risk function asks for before signing, published rather than sent
        on request. Where we do not meet a requirement, this page says so.
      </p>

      <section className="mt-12 space-y-4">
        <h2 className="text-2xl font-semibold">Where your data is processed</h2>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p>{RESIDENCY_SUMMARY}</p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Processing location by provider</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Provider
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  What runs there
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Region
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {DATA_RESIDENCY.map((entry) => (
                <tr key={entry.provider}>
                  <td className="px-4 py-3 font-medium">{entry.provider}</td>
                  <td className="px-4 py-3">
                    {entry.what}
                    <span className="mt-1 block text-xs text-muted-foreground">{entry.note}</span>
                  </td>
                  <td className="px-4 py-3">{entry.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Support commitment</h2>
        <p className="text-muted-foreground">
          {SUPPORT_HOURS} Reach us at{' '}
          <a href={`mailto:${SUPPORT_CONTACT}`} className="underline">
            {SUPPORT_CONTACT}
          </a>
          .
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Support severity levels and response targets</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Severity
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  What it means
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  First response
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Updates
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {SUPPORT_SEVERITIES.map((entry) => (
                <tr key={entry.level}>
                  <td className="px-4 py-3 font-medium">{entry.level}</td>
                  <td className="px-4 py-3">{entry.meaning}</td>
                  <td className="px-4 py-3">{entry.targetResponse}</td>
                  <td className="px-4 py-3">{entry.targetUpdate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">
          Availability target: {AVAILABILITY_TARGET.target}. {AVAILABILITY_TARGET.note}
        </p>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Backup and recovery</h2>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p>{RECOVERY_TESTING_STATEMENT}</p>
        </div>
        <ul className="divide-y rounded-lg border">
          {RECOVERY_OBJECTIVES.map((entry) => (
            <li key={entry.scenario} className="space-y-1 px-4 py-3">
              <p className="font-medium">{entry.scenario}</p>
              <p className="text-sm">
                Data loss window {entry.rpo} · Recovery time {entry.rto}
              </p>
              <p className="text-sm text-muted-foreground">{entry.mechanism}</p>
              <p className="text-xs text-muted-foreground">
                {entry.lastTestedAt
                  ? `Last tested ${entry.lastTestedAt}`
                  : 'Never tested. This is a design target, not a measurement.'}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Incident response</h2>
        <p className="text-muted-foreground">
          Written to be followed under pressure by someone who did not write it.
        </p>
        <ul className="divide-y rounded-lg border">
          {INCIDENT_ROLES.map((entry) => (
            <li key={entry.role} className="space-y-1 px-4 py-3">
              <p className="font-medium">{entry.role}</p>
              <p className="text-sm text-muted-foreground">{entry.responsibility}</p>
            </li>
          ))}
        </ul>
        <ol className="space-y-3">
          {INCIDENT_STEPS.map((entry, index) => (
            <li key={entry.step} className="rounded-lg border p-4">
              <p className="font-medium">
                {index + 1}. {entry.step}
              </p>
              <p className="mt-1 text-sm">{entry.detail}</p>
              <p className="mt-1 text-xs text-muted-foreground">{entry.deadline}</p>
            </li>
          ))}
        </ol>
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">Notification templates</summary>
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium">To the supervisory authority</h3>
              <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-4 text-xs">
                {BREACH_NOTIFICATION_TEMPLATE.regulator}
              </pre>
            </div>
            <div>
              <h3 className="text-sm font-medium">To affected people</h3>
              <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-4 text-xs">
                {BREACH_NOTIFICATION_TEMPLATE.user}
              </pre>
            </div>
          </div>
        </details>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Processing terms</h2>
        <p className="text-muted-foreground">
          The positions a data processing agreement has to state. For a countersigned agreement,
          write to{' '}
          <a href={`mailto:${PROCUREMENT_CONTACT}`} className="underline">
            {PROCUREMENT_CONTACT}
          </a>
          .
        </p>
        <ul className="divide-y rounded-lg border">
          {PROCESSING_TERMS.map((entry) => (
            <li key={entry.clause} className="space-y-1 px-4 py-3">
              <p className="font-medium">{entry.clause}</p>
              <p className="text-sm text-muted-foreground">{entry.position}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Subprocessors: {SUBPROCESSORS.map((entry) => entry.name).join(', ')}. Each is listed on
          the <Link href="/trust" className="underline">trust centre</Link> with the data it
          handles.
        </p>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Security questionnaire</h2>
        <p className="text-muted-foreground">
          The questions every questionnaire asks, answered once so the answers cannot drift.
        </p>
        <ul className="divide-y rounded-lg border">
          {SECURITY_QUESTIONNAIRE.map((entry) => (
            <li key={entry.question} className="space-y-1 px-4 py-3">
              <p className="font-medium">{entry.question}</p>
              <p className="text-sm text-muted-foreground">{entry.answer}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">If LucidData ends</h2>
        <ul className="divide-y rounded-lg border">
          {CONTINUITY.map((entry) => (
            <li key={entry.question} className="space-y-1 px-4 py-3">
              <p className="font-medium">{entry.question}</p>
              <p className="text-sm text-muted-foreground">{entry.answer}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
