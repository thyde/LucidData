import type { Metadata } from 'next'
import Link from 'next/link'
import { Wallet, Lock, Store, LineChart, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataPipeline } from '@/components/marketing/sections'

export const metadata: Metadata = {
  title: 'For individuals | LucidData',
  description: 'Own your data, decide who can use it, and earn every time it is sold.',
}

const POINTS = [
  {
    icon: Lock,
    title: 'An encrypted vault',
    body: 'Your data is encrypted in your browser before it ever reaches us. Only you hold the key.',
  },
  {
    icon: Store,
    title: 'Sell on your terms',
    body: 'Toggle which fields are for sale, choose which buyers and purposes you allow, and set a price floor.',
  },
  {
    icon: Wallet,
    title: 'Get paid',
    body: 'Earn each time your anonymized data is purchased. Track revenue by category on your dashboard.',
  },
  {
    icon: LineChart,
    title: 'Full transparency',
    body: 'See who collected and bought your data, with an immutable audit trail you can verify.',
  },
]

export default function ForIndividualsPage() {
  return (
    <>
      <section className="border-b">
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">
            Your data is an asset. Start treating it like one.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Store, control, and monetize your personal data without ever surrendering ownership.
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

      <section>
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">You&apos;re in charge.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            We never sell anything you don&apos;t ask us to. It&apos;s that simple.
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
