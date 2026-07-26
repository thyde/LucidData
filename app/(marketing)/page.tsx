import type { Metadata } from 'next'
import {
  Hero,
  FeatureGrid,
  AudienceSplit,
  DataPipeline,
  CtaSection,
} from '@/components/marketing/sections'

export const metadata: Metadata = {
  title: 'LucidData: Store and control your personal data',
  description:
    'LucidData is a privacy-first personal data bank for encrypted storage, consent, credentials, and seller-approved data snapshots.',
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
