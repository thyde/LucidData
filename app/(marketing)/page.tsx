import type { Metadata } from 'next'
import {
  Hero,
  FeatureGrid,
  AudienceSplit,
  DataPipeline,
  CtaSection,
} from '@/components/marketing/sections'

export const metadata: Metadata = {
  title: 'LucidData: your health records, encrypted and in your control',
  description:
    'Keep your health and personal records in a vault encrypted in your browser, and share only what you choose, for as long as you choose.',
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
