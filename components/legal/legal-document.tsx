import Link from 'next/link'
import type { ReactNode } from 'react'
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '@/lib/constants/legal'

/** "2026-10-08" as "October 8, 2026", read as a calendar date in any time zone. */
export function formatLegalDate(version: string): string {
  return new Date(`${version}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** "a, b, and c", or "a, b, or c". */
export function listOf(items: readonly string[], conjunction: 'and' | 'or' = 'and'): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface LegalDocumentProps {
  id: LegalDocumentId
  children: ReactNode
}

/** LD-110. The frame every legal document shares: title, version date, and summary. */
export function LegalDocument({ id, children }: LegalDocumentProps) {
  const document = LEGAL_DOCUMENTS[id]
  return (
    <article className="container mx-auto max-w-3xl px-4 py-16">
      <Link href="/legal" className="text-sm text-muted-foreground hover:text-foreground">
        All legal documents
      </Link>
      <header className="mt-4 space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">{document.title}</h1>
        <p className="text-sm text-muted-foreground">
          In effect from <time dateTime={document.version}>{formatLegalDate(document.version)}</time>
        </p>
        <p className="text-lg text-muted-foreground">{document.summary}</p>
      </header>
      <div className="mt-12 space-y-12">{children}</div>
    </article>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  const id = slug(title)
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="scroll-mt-24 text-2xl font-semibold">
        {title}
      </h2>
      <div className="space-y-4 leading-7">{children}</div>
    </section>
  )
}

export function LegalSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-medium">{title}</h3>
      <div className="space-y-2 leading-7">{children}</div>
    </div>
  )
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6 leading-7">{children}</ul>
}

/** An inline link to another page, styled the same everywhere in the documents. */
export function DocumentLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-primary underline">
      {children}
    </Link>
  )
}

export function Mail({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className="text-primary underline">
      {address}
    </a>
  )
}
