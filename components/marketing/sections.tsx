import Link from 'next/link'
import {
  ShieldCheck,
  KeyRound,
  ScrollText,
  Wallet,
  Store,
  BadgeCheck,
  ShoppingBag,
  Package,
  UploadCloud,
  LayoutDashboard,
  TrendingUp,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      <div className="container mx-auto px-4 py-20 text-center md:py-28">
        <p className="mb-4 inline-block rounded-full border bg-muted/50 px-4 py-1 text-sm text-muted-foreground">
          The personal data bank
        </p>
        <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">
          You manage my money. <span className="text-primary">Why not my data?</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          The $200B data market runs on your information, yet you never see a cent or know where
          it goes. LucidData hands you the controls: own your data, decide who can use it, and
          earn every time it is sold.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/for-individuals">Take control of your data</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/for-business">For business</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  {
    icon: KeyRound,
    title: 'You hold the keys',
    body: 'Vault data is encrypted in your browser. We store only ciphertext, so we can never read or sell anything you do not approve.',
  },
  {
    icon: ScrollText,
    title: 'Every access is logged',
    body: 'An immutable, tamper-evident audit trail records who touched your data, when, and why.',
  },
  {
    icon: Wallet,
    title: 'Earn from your data',
    body: 'Opt fields into anonymized pools and get paid when buyers purchase. You set the terms.',
  },
  {
    icon: BadgeCheck,
    title: 'Verifiable credentials',
    body: 'Hold diplomas, IDs, and credentials issued by trusted organizations and share only what is needed.',
  },
]

export function FeatureGrid() {
  return (
    <section className="border-b bg-muted/20">
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Built so you stay in control</h2>
          <p className="mt-3 text-muted-foreground">
            A transparent platform where your data is treated as property, not product.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="h-full">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{f.body}</CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

export function AudienceSplit() {
  return (
    <section className="border-b">
      <div className="container mx-auto grid gap-6 px-4 py-20 md:grid-cols-2">
        <Card className="flex h-full flex-col border-primary/20">
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle className="text-2xl">For individuals</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <p className="text-muted-foreground">
              Store your data in an encrypted vault, see who wants it, and choose how and to whom
              you sell. Watch your earnings grow on a dashboard you control.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• Encrypted personal data vault</li>
              <li>• Marketplace to sell on your terms</li>
              <li>• Track sources, buyers, and revenue</li>
            </ul>
            <div className="mt-6">
              <Button asChild>
                <Link href="/for-individuals">
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col">
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Store className="h-5 w-5" />
            </div>
            <CardTitle className="text-2xl">For business</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <p className="text-muted-foreground">
              Issue verifiable credentials, validate the credentials people share with you, or
              buy consented, anonymized data in bulk, all with a clear audit trail.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• Issue diplomas, IDs, and credentials</li>
              <li>• Verify what customers share</li>
              <li>• Purchase bulk anonymized datasets</li>
            </ul>
            <div className="mt-6">
              <Button asChild variant="outline">
                <Link href="/for-business">
                  Explore business <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

const PIPELINE = [
  { icon: ShoppingBag, title: 'Collect', body: 'Add data to your vault or claim credentials from trusted issuers.' },
  { icon: Package, title: 'Package & anonymize', body: 'Choose fields to share; we strip identifiers in your browser before anything leaves.' },
  { icon: UploadCloud, title: 'Contribute', body: 'Opt approved fields into buyer data pools you choose.' },
  { icon: LayoutDashboard, title: 'Access', body: 'Buyers purchase only what you consented to share.' },
  { icon: TrendingUp, title: 'Earn', body: 'Revenue accrues to you and shows up on your dashboard.' },
]

export function DataPipeline() {
  return (
    <section className="border-b bg-muted/20">
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mt-3 text-muted-foreground">
            Your data&apos;s journey from collection to earnings, fully transparent.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((step, i) => (
            <div key={step.title} className="relative text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <step.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              <span
                className={cn(
                  'absolute right-0 top-6 hidden h-px w-full translate-x-1/2 bg-border lg:block',
                  i === PIPELINE.length - 1 && 'lg:hidden'
                )}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CtaSection() {
  return (
    <section>
      <div className="container mx-auto px-4 py-20">
        <div className="rounded-2xl border bg-primary/5 px-6 py-14 text-center">
          <h2 className="text-3xl font-bold tracking-tight">If you don&apos;t own your data, someone else profits from it.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Join LucidData and put yourself back in charge.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">Create your account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/for-business">I&apos;m a business</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
