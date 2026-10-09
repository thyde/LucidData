import type { Metadata } from 'next'
import { HealthTimeline } from '@/components/health/health-timeline'

export const metadata: Metadata = {
  title: 'Health | LucidData',
  description: 'Daily charts of the health records in your vault, worked out in your browser.',
}

export default function HealthPage() {
  return <HealthTimeline />
}
