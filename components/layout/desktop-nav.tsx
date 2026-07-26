'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/vault', label: 'Vault' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/credentials', label: 'Credentials' },
  { href: '/consent', label: 'Consents' },
  { href: '/audit', label: 'Audit Log' },
  { href: '/requests', label: 'Requests' },
]

export function DesktopNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="hidden space-x-6 md:flex">
      {links.map((link) => {
        const active = pathname === link.href

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'text-sm font-medium transition-colors hover:text-foreground',
              active ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}