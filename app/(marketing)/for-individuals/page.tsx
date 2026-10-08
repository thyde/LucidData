import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock, HeartPulse, Handshake, ScrollText, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataPipeline } from '@/components/marketing/sections'
import {
  PAYOUT_THRESHOLD_CENTS,
  formatFeePercent,
} from '@/lib/constants/marketplace-economics'

export const metadata: Metadata = {
  title: 'For individuals | LucidData',
  description: 'Bring your health records into one encrypted vault that only you can open.',
}

const POINTS = [
  {
    icon: Lock,
    title: 'Encrypted before it leaves your device',
    body: 'Your browser encrypts every entry with a key made from your password. We never hold that key, so we cannot read what is inside your entries.',
  },
  {
    icon: HeartPulse,
    title: 'Yours to take with you',
    body: 'Import an Apple Health export and keep the credentials organizations issue to you. Export your whole vault as an open JSON-LD file whenever you like.',
  },
  {
    icon: Handshake,
    title: 'Share only what is needed',
    body: 'Send a credential through a link that shows only the fields you pick, with an expiry if you want one. Revoke the link at any time.',
  },
  {
    icon: ScrollText,
    title: 'See every access',
    body: 'A tamper-evident audit log records who used your data and when.',
  },
]

const PAYOUT_THRESHOLD = `$${PAYOUT_THRESHOLD_CENTS / 100}`

export default function ForIndividualsPage() {
  return (
    <>
      <section className="border-b">
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">
            One encrypted place for your health records.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Bring in your Apple Health export, keep the credentials you are issued, and share only
            what you choose.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                Create your vault <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b bg-muted/20">
        <div className="container mx-auto grid gap-6 px-4 py-20 sm:grid-cols-2">
          {POINTS.map((p) => (
            <Card key={p.title} className="h-full">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">{p.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{p.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <DataPipeline />

      <section className="border-b">
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-2xl font-bold tracking-tight">What about selling data?</h2>
          <p className="mt-3 text-muted-foreground">
            LucidData never sells health data and never uses it for advertising. A separate,
            optional marketplace lets you contribute some credential data, such as the degree on a
            diploma, to a buyer&apos;s request. Before you agree, you see the buyer, the purpose,
            and what you would receive after our {formatFeePercent()} fee.
          </p>
          <p className="mt-3 text-muted-foreground">
            The amounts are small. We estimate a few dollars a year for most people, and we pay out
            once a balance reaches {PAYOUT_THRESHOLD}, so many people will not be paid within a
            year.
          </p>
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">You decide what to share.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Health data is never sold. Nobody else can open your entries, and you can revoke
            anything you share at any time.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/register">Get started for free</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
