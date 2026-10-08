import Link from 'next/link'
import { Logo } from '@/components/marketing/logo'
import { ACCOUNT_DELETION_PATH, LEGAL_DOCUMENTS } from '@/lib/constants/legal'

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
  {
    title: 'Trust',
    links: [
      { href: '/trust', label: 'Trust centre' },
      { href: '/trust/threat-model', label: 'Threat model' },
      { href: '/trust/accessibility', label: 'Accessibility' },
      { href: '/trust/extension', label: 'Browser extension' },
    ],
  },
  {
    // LD-110: Washington's My Health My Data Act wants the health policy linked
    // from the homepage, and the footer is on every public page.
    title: 'Legal',
    links: [
      { href: LEGAL_DOCUMENTS.terms.path, label: LEGAL_DOCUMENTS.terms.title },
      { href: LEGAL_DOCUMENTS.privacy.path, label: LEGAL_DOCUMENTS.privacy.title },
      {
        href: LEGAL_DOCUMENTS['health-privacy'].path,
        label: LEGAL_DOCUMENTS['health-privacy'].title,
      },
      { href: LEGAL_DOCUMENTS['organization-terms'].path, label: 'Organization terms' },
      { href: ACCOUNT_DELETION_PATH, label: 'Delete your account' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto grid gap-8 px-4 py-12 md:grid-cols-6">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            An encrypted vault for your health and personal records, shared only on your terms.
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
          <p>Vault entries are encrypted in your browser before they reach us.</p>
        </div>
      </div>
    </footer>
  )
}
