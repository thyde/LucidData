import type { Metadata } from 'next'
import Link from 'next/link'
import {
  KEY_CUSTODY,
  KEY_HOLDER_LABEL,
  SERVER_VISIBLE_VAULT_METADATA,
  CERTIFICATIONS,
  SUBPROCESSORS,
  REVOCATION_LIMIT,
  VULNERABILITY_DISCLOSURE,
} from '@/lib/constants/trust-disclosures'
import { RESIDUAL_DISCLOSURES } from '@/lib/constants/deletion-manifest'
import {
  CONSENT_REQUEST_RETENTION_DAYS,
  CREDENTIAL_REQUEST_RETENTION_DAYS,
  SHARE_RETENTION_DAYS,
  NOTIFICATION_RETENTION_DAYS,
} from '@/lib/constants/retention'

export const metadata: Metadata = {
  title: 'Trust centre | LucidData',
  description:
    'Where encryption happens, who holds each key, what the server can see, and what LucidData cannot do.',
}

const CERTIFICATION_LABEL: Record<string, string> = {
  achieved: 'Achieved',
  in_progress: 'In progress',
  not_started: 'Not started',
}

export default function TrustPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <header className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">Trust centre</h1>
        <p className="text-lg text-muted-foreground">
          Most products ask you to take a privacy claim on faith. This page is the evidence
          instead: where encryption happens, who holds each key, what our servers can still
          see, and what we cannot do even if we wanted to.
        </p>
      </header>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">The short version</h2>
        <ul className="space-y-2 text-muted-foreground">
          <li>
            Your vault is encrypted in your browser before it reaches us. We store ciphertext.
          </li>
          <li>
            Your master key is derived from your password on your device. It is never sent to
            us, so we cannot decrypt your vault, and neither can anyone who reaches our
            database.
          </li>
          <li>
            Some vault metadata is stored unencrypted so your entries can be listed and
            filtered. That list is below. Do not put sensitive content in those fields.
          </li>
          <li>
            Two kinds of key are held on our servers, and both are for signing statements
            rather than reading your data. They are named below.
          </li>
        </ul>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Key custody</h2>
        <p className="text-muted-foreground">
          Every piece of key material in the product, where it comes from, and who can use it.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Key custody for every cryptographic module in LucidData
            </caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Key material
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Held by
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Where it comes from
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  What it protects
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {KEY_CUSTODY.map((entry) => (
                <tr key={entry.module} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{entry.material}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      lib/crypto/{entry.module}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        entry.heldBy === 'server'
                          ? 'inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100'
                          : 'inline-block rounded-full bg-muted px-2 py-1 text-xs font-medium'
                      }
                    >
                      {KEY_HOLDER_LABEL[entry.heldBy]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.derivedOrGenerated}
                  </td>
                  <td className="px-4 py-3">
                    <p>{entry.protects}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.note}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">What our servers can see</h2>
        <p className="text-muted-foreground">
          Vault contents are ciphertext. These columns are stored unencrypted so the app can
          list, filter, and scope your entries without decrypting them. Keep sensitive content
          out of them.
        </p>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Unencrypted vault metadata columns</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Column
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Why it is unencrypted
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {SERVER_VISIBLE_VAULT_METADATA.map((row) => (
                <tr key={row.column}>
                  <td className="px-4 py-3 font-mono text-xs">{row.column}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          Consent terms, audit records, credential claims, and billing details are also stored
          unencrypted, because both parties and any auditor need to read them.
        </p>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">What revocation cannot do</h2>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p>{REVOCATION_LIMIT}</p>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Retention</h2>
        <p className="text-muted-foreground">
          Records are destroyed on a schedule rather than kept indefinitely. A job runs every
          15 minutes and enforces these windows.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Retention window for each kind of record</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Record
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Destroyed after
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-4 py-3">Consent requests, once answered or lapsed</td>
                <td className="px-4 py-3">{CONSENT_REQUEST_RETENTION_DAYS} days</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Credential requests, once answered or lapsed</td>
                <td className="px-4 py-3">{CREDENTIAL_REQUEST_RETENTION_DAYS} days</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Share links, once expired or revoked</td>
                <td className="px-4 py-3">{SHARE_RETENTION_DAYS} days</td>
              </tr>
              <tr>
                <td className="px-4 py-3">In-app notifications</td>
                <td className="px-4 py-3">{NOTIFICATION_RETENTION_DAYS} days</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Records inside a purchased dataset</td>
                <td className="px-4 py-3">
                  When the buyer&apos;s download window closes, or when the retention period
                  the buyer declared runs out, whichever comes first
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">What deletion leaves behind</h2>
        <p className="text-muted-foreground">
          Deleting your account removes your vault, consents, credentials, contributions, and
          audit history. Four things survive, and each one is listed on the signed receipt you
          get when you delete.
        </p>
        <ul className="divide-y rounded-lg border">
          {RESIDUAL_DISCLOSURES.map((item) => (
            <li key={`${item.holder}-${item.what}`} className="space-y-1 px-4 py-3">
              <p className="font-medium">{item.what}</p>
              <p className="text-sm text-muted-foreground">
                Held by {item.holder}. {item.why}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Certification status</h2>
        <p className="text-muted-foreground">
          We publish only what is true. Nothing below is claimed as both achieved and under
          way.
        </p>
        <ul className="divide-y rounded-lg border">
          {CERTIFICATIONS.map((item) => (
            <li key={item.standard} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{item.standard}</p>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium">
                {CERTIFICATION_LABEL[item.state]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Subprocessors</h2>
        <p className="text-muted-foreground">
          Third parties that process data on our behalf, and what each one handles.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Subprocessors and the data each one handles</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Provider
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Data handled
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {SUBPROCESSORS.map((processor) => (
                <tr key={processor.name} className="align-top">
                  <td className="px-4 py-3 font-medium">{processor.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{processor.role}</td>
                  <td className="px-4 py-3 text-muted-foreground">{processor.dataHandled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Report a vulnerability</h2>
        <p className="text-muted-foreground">{VULNERABILITY_DISCLOSURE.policy}</p>
        <p>
          <a
            href={`mailto:${VULNERABILITY_DISCLOSURE.email}`}
            className="font-medium text-primary underline"
          >
            {VULNERABILITY_DISCLOSURE.email}
          </a>
        </p>
      </section>

      <section className="mt-14 rounded-lg border bg-muted/30 p-6">
        <h2 className="text-xl font-semibold">Threat model</h2>
        <p className="mt-2 text-muted-foreground">
          What each design decision protects against, and what it leaves exposed.
        </p>
        <Link
          href="/trust/threat-model"
          className="mt-4 inline-block font-medium text-primary underline"
        >
          Read the threat model
        </Link>
      </section>

      <section className="mt-6 rounded-lg border bg-muted/30 p-6">
        <h2 className="text-xl font-semibold">Assurance and procurement</h2>
        <p className="mt-2 text-muted-foreground">
          Processing terms, support commitments, data residency, recovery objectives, the
          incident runbook, and answers to the standard security questionnaire. Including where
          we do not yet meet a requirement.
        </p>
        <Link
          href="/trust/assurance"
          className="mt-4 inline-block font-medium text-primary underline"
        >
          Read the assurance pack
        </Link>
      </section>

      <section className="mt-6 rounded-lg border bg-muted/30 p-6">
        <h2 className="text-xl font-semibold">Accessibility</h2>
        <p className="mt-2 text-muted-foreground">
          How the product conforms to WCAG 2.2 Level AA, how that was evaluated, and every
          limitation we know about. The product handles health, financial, and legal records,
          which is exactly the data the people most likely to be excluded depend on.
        </p>
        <Link
          href="/trust/accessibility"
          className="mt-4 inline-block font-medium text-primary underline"
        >
          Read the accessibility statement
        </Link>
      </section>
    </div>
  )
}
