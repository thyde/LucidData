import type { Metadata } from 'next'
import {
  Hero,
  FeatureGrid,
  AudienceSplit,
  DataPipeline,
  CtaSection,
} from '@/components/marketing/sections'

export const metadata: Metadata = {
  title: 'LucidData: Own, control, and earn from your data',
  description:
    'LucidData is a privacy-first personal data bank. Store your data encrypted, decide who can use it, and earn every time it is sold.',
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <FeatureGrid />
      <AudienceSplit />
      <DataPipeline />
      <CtaSection />
    </>
  )
}
