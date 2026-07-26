import Link from 'next/link'

/**
 * LD-108: skip past the header to the page content.
 *
 * Hidden until it takes focus, which is the point. Someone using a keyboard
 * lands on this first and can reach the content in one keystroke instead of
 * tabbing through the whole navigation on every page.
 */
export function SkipLink() {
  return (
    <Link
      href="#main"
      className="sr-only rounded-md bg-background px-4 py-2 text-sm font-medium underline focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:ring-2 focus:ring-ring"
    >
      Skip to content
    </Link>
  )
}
