import type { Metadata } from 'next'
import { SharedSummaryViewer } from '@/components/health/shared-summary-viewer'

export const metadata: Metadata = {
  title: 'A shared health summary | LucidData',
  description: 'Health figures someone chose to share with you through LucidData.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

// The page embeds the share id, so it is rendered for each request and never cached.
export const dynamic = 'force-dynamic'

export default async function SharedSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SharedSummaryViewer id={id} />
}
