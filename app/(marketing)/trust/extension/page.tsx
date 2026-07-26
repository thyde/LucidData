import type { Metadata } from 'next'
import Link from 'next/link'
import {
  EXTENSION_AVAILABILITY,
  EXTENSION_INSTALL_HOSTS,
  EXTENSION_INSTALL_PERMISSIONS,
  EXTENSION_TIERS,
  EXTENSION_VERSION,
  INSTALL_PERMISSION_REASONS,
} from '@/lib/constants/extension'

export const metadata: Metadata = {
  title: 'Browser extension | LucidData',
  description:
    'Every permission the LucidData browser extension holds, what it is for, and which capabilities are off until you turn them on.',
}

export default function ExtensionTrustPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm">
        <Link href="/trust" className="text-muted-foreground hover:underline">
          Trust centre
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>Browser extension</span>
      </nav>

      <h1 className="text-3xl font-semibold">Browser extension permissions</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        An extension that says it will not watch you browse is asking to be believed. This one is
        built so you do not have to. The browsing permissions are optional, which means the
        browser itself withholds them until you say yes, and you can confirm that on your
        browser&apos;s extension details page rather than taking our word for it.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Version {EXTENSION_VERSION}. {EXTENSION_AVAILABILITY}
      </p>

      <section className="mt-12 space-y-4">
        <h2 className="text-2xl font-semibold">What installing it grants</h2>
        <p className="text-muted-foreground">
          This is the complete list. Nothing here can read the pages you visit, your history, or
          your open tabs.
        </p>
        <ul className="space-y-3">
          {EXTENSION_INSTALL_PERMISSIONS.map((permission) => (
            <li key={permission} className="rounded-lg border p-4">
              <p className="font-medium">{permission}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {INSTALL_PERMISSION_REASONS[permission] ?? 'No description recorded.'}
              </p>
            </li>
          ))}
          <li className="rounded-lg border p-4">
            <p className="font-medium">Site access</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Limited to {EXTENSION_INSTALL_HOSTS.join(' and ')}, so a detected export can be
              handed to your vault. No other site is reachable.
            </p>
          </li>
        </ul>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Capabilities, and how each one is granted</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Extension capability tiers, the permissions each needs, and when it is granted
            </caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Capability
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  What it does
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Browser permission
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Granted
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {EXTENSION_TIERS.map((tier) => (
                <tr key={tier.id}>
                  <td className="px-4 py-3 font-medium">
                    {tier.name}
                    <span className="mt-1 block text-xs text-muted-foreground">{tier.spec}</span>
                  </td>
                  <td className="px-4 py-3">
                    {tier.capability}
                    <span className="mt-1 block text-xs text-muted-foreground">{tier.reason}</span>
                  </td>
                  <td className="px-4 py-3">
                    {tier.permissions.length === 0 && tier.origins.length === 0
                      ? 'None beyond install'
                      : [...tier.permissions, ...tier.origins].join(', ')}
                  </td>
                  <td className="px-4 py-3">{tier.granted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">Turning a capability off</h2>
        <p className="text-muted-foreground">
          Switching a capability off removes the underlying browser permission rather than
          setting a flag we control. If two capabilities need the same permission, it is removed
          once neither is on. That is checkable: after turning tracker insight off, your
          browser&apos;s extension details page should no longer list access to all sites.
        </p>
        <p className="text-muted-foreground">
          Uninstalling removes every permission and everything the extension stored on your
          device. Nothing about the extension is kept on our servers, because it never sends us
          anything.
        </p>
      </section>

      <section className="mt-14 space-y-4">
        <h2 className="text-2xl font-semibold">What it does with a file</h2>
        <p className="text-muted-foreground">
          When an export finishes downloading, the extension notices the file name and where it
          came from. It does not read the file. If you choose to import it, the file is handed to
          the vault page in your browser and encrypted there with your key before anything is
          stored. It is never uploaded by the extension.
        </p>
      </section>
    </div>
  )
}
