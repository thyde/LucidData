import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, ShieldCheck, Database, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'For business | LucidData',
  description: 'Issue credentials, verify what people share, or buy consented anonymized data in bulk.',
}

const PRODUCTS = [
  {
    icon: BadgeCheck,
    title: 'Issue credentials',
    body: 'Mint signed, verifiable credentials (diplomas, IDs, employment, and more) that recipients hold in their own vault.',
    bullets: ['Ed25519-signed credentials', 'Domain verification', 'API + portal issuance'],
    cta: { label: 'Become an issuer', href: '/org/register' },
  },
  {
    icon: ShieldCheck,
    title: 'Verify credentials',
    body: 'Instantly check the credentials people choose to share with you against the issuer signature.',
    bullets: ['Selective disclosure', 'Cryptographic verification', 'No data retention required'],
    cta: { label: 'Become a verifier', href: '/org/register' },
  },
  {
    icon: Database,
    title: 'Buy bulk data',
    body: 'Purchase consented, anonymized datasets from people who opted in, by snapshot, subscription, or filtered bundle.',
    bullets: ['Consented & anonymized', 'Flexible pricing models', 'Dataset exports'],
    cta: { label: 'Become a buyer', href: '/org/register' },
  },
]

export default function ForBusinessPage() {
  return (
    <>
      <section className="border-b">
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">
            Trusted data, on terms everyone agrees to.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Issue verifiable credentials, validate what customers share, or buy consented,
            anonymized data in bulk, all with a clear audit trail.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/org/register">
                Register your organization <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/org">Go to org portal</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-muted/20">
        <div className="container mx-auto grid gap-6 px-4 py-20 md:grid-cols-3">
          {PRODUCTS.map((p) => (
            <Card key={p.title} className="flex h-full flex-col">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl">{p.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="text-sm text-muted-foreground">{p.body}</p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {p.bullets.map((b) => (
                    <li key={b}>• {b}</li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Button asChild variant="outline" className="w-full">
                    <Link href={p.cta.href}>{p.cta.label}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  )
}
