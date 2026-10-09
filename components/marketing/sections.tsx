import Link from 'next/link'
import {
  KeyRound,
  ScrollText,
  HeartPulse,
  Handshake,
  ShieldCheck,
  Store,
  UploadCloud,
  Lock,
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
          An encrypted vault for your health records
        </p>
        <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">
          Your health history, in a vault{' '}
          <span className="text-primary">only you can open.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Bring in your Apple Health export and the records you keep yourself. Each entry is
          encrypted in your browser before it reaches us, so you are the only one who can read it.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/register">Create your vault</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/trust">How we protect it</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  {
    icon: KeyRound,
    title: 'Only you hold the key',
    body: 'Entries are encrypted in your browser with a key made from your password, which we never see, so we cannot read what is inside them. Labels and dates stay readable so your vault can list them, and the trust centre names every readable field.',
  },
  {
    icon: HeartPulse,
    title: 'Your history in one place',
    body: 'Import an Apple Health export, and add workouts, daily activity, or medical details yourself.',
  },
  {
    icon: Handshake,
    title: 'Share only what is needed',
    body: 'Send your doctor or coach the health figures you pick, for the dates you pick, through a link that expires. A credential works the same way and shows only the fields you choose. You can revoke a link whenever you like.',
  },
  {
    icon: ScrollText,
    title: 'Every access is logged',
    body: 'A tamper-evident log shows who used your data and when.',
  },
]

export function FeatureGrid() {
  return (
    <section className="border-b bg-muted/20">
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Built so you stay in control</h2>
          <p className="mt-3 text-muted-foreground">
            We cannot open your entries, and we never sell your health data or use it for
            advertising.
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
              Keep your health and personal records in an encrypted vault that only you can open,
              and check every use of your data in your log.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• Encrypted in your browser</li>
              <li>• Apple Health import</li>
              <li>• Health data is never sold</li>
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
              Issue verifiable credentials, verify the ones people share with you, and ask for
              consent before you use someone&apos;s data.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• Issue diplomas, employment records, and other credentials</li>
              <li>• Verify what people share</li>
              <li>• Ask for consent with a stated purpose</li>
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
  {
    icon: UploadCloud,
    title: 'Bring it in',
    body: 'Import an Apple Health export, or add a record by hand.',
  },
  {
    icon: Lock,
    title: 'Encrypted on your device',
    body: 'Your browser encrypts each entry before it is sent. We store only the encrypted copy.',
  },
  {
    icon: Handshake,
    title: 'Share what you choose',
    body: "Send a doctor a link to the figures you pick, or a credential that shows only the fields you choose. An organization gets access only when you approve its request.",
  },
  {
    icon: ScrollText,
    title: 'See every access',
    body: 'Your log shows who used your data and when, and you can revoke a link or an approval at any time.',
  },
]

export function DataPipeline() {
  return (
    <section className="border-b bg-muted/20">
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mt-3 text-muted-foreground">
            Your records stay encrypted at every step, and nothing is shared until you say so.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
          <h2 className="text-3xl font-bold tracking-tight">Start with the records you already have.</h2>
          {/* LD-108: muted grey sits at 4.6:1 on white and drops below AA on
              this tinted panel. Dimmed foreground keeps the hierarchy and the
              contrast. */}
          <p className="mx-auto mt-3 max-w-xl text-foreground/80">
            A vault for your own records is free.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">Create your vault</Link>
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
