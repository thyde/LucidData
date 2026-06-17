import Link from 'next/link'
import { Logo } from '@/components/marketing/logo'

const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      { href: '/for-individuals', label: 'For individuals' },
      { href: '/for-business', label: 'For business' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { href: '/register', label: 'Create an account' },
      { href: '/login', label: 'Log in' },
      { href: '/org/register', label: 'Register an organization' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto grid gap-8 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Your data. Your bank. Your rules. Own, control, and earn from your personal data
            under explicit, time-bound consent.
          </p>
        </div>
        {FOOTER_GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="text-sm font-semibold">{group.title}</h3>
            <ul className="mt-3 space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} LucidData. All rights reserved.</p>
          <p>Built privacy-first with client-side encryption.</p>
        </div>
      </div>
    </footer>
  )
}
