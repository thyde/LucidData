'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useEncryption } from '@/lib/context/encryption-context'
import { useToast } from '@/lib/hooks/use-toast'
import { createVaultEntryAction } from '@/lib/actions/vault.actions'
import { VAULT_KEYS } from '@/lib/hooks/useVault'
import { clearInsight, getInsight, type InsightState } from '@/lib/extension/bridge-client'

/**
 * LD-206: who collected data as you browsed.
 *
 * This is the one panel in the product that is useful on day one with an empty
 * vault, because it reports something that already happened to the person
 * rather than something they have to supply first.
 *
 * Everything shown here was computed in the browser extension on the device.
 * The page receives counts and company names, never a site, a path, or a
 * title, because the extension never produced one.
 */

const CATEGORY_LABEL: Record<string, string> = {
  advertising: 'Advertising',
  analytics: 'Analytics',
  social: 'Social network',
  fingerprinting: 'Fingerprinting',
  cdn: 'Content delivery',
  tagmanager: 'Tag management',
  unknown: 'Unclassified',
}

export function TrackerInsight() {
  const [state, setState] = useState<InsightState | null>(null)
  const [saving, setSaving] = useState(false)
  const { encrypt, isLocked } = useEncryption()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const refresh = useCallback(async () => {
    const result = await getInsight().catch(() => null)
    setState(result)
  }, [])

  useEffect(() => {
    // Deferred so the dashboard renders before the bridge is probed. No
    // extension resolves to null after a short wait, which is the normal case.
    const timer = setTimeout(() => {
      void refresh()
    }, 0)
    return () => clearTimeout(timer)
  }, [refresh])

  const keep = useCallback(async () => {
    if (!state?.vaultRecord || isLocked) return
    setSaving(true)
    try {
      const encrypted = await encrypt(JSON.stringify(state.vaultRecord))
      await createVaultEntryAction({
        label: `Tracker summary to ${state.vaultRecord.period_end}`,
        category: 'other',
        schema_type: 'browsing_insight',
        ...encrypted,
      })
      await clearInsight()
      queryClient.invalidateQueries({ queryKey: VAULT_KEYS.lists() })
      toast({ title: 'Saved to your vault' })
      await refresh()
    } catch (error) {
      toast({
        title: 'Could not save it',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [state, isLocked, encrypt, queryClient, toast, refresh])

  // No extension. Say nothing rather than advertising into an empty dashboard.
  if (!state) return null

  if (!state.enabled) {
    return (
      <section className="rounded-lg border p-5">
        <h2 className="text-lg font-medium">See who is collecting data on you</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The LucidData extension can show which companies collect data as you browse. The
          analysis runs on your device and nothing about your browsing is sent to us. It is off
          until you turn it on, and your browser will ask you first.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Turn it on from the extension&apos;s options page.
        </p>
      </section>
    )
  }

  const summary = state.summary
  if (!summary || summary.siteCount === 0) {
    return (
      <section className="rounded-lg border p-5">
        <h2 className="text-lg font-medium">Tracker insight</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing to report yet. Browse for a while and this will fill in.
        </p>
      </section>
    )
  }

  const reach = Math.round(summary.reach * 100)

  return (
    <section className="space-y-4 rounded-lg border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Who collected data on you</h2>
          <p className="text-sm text-muted-foreground">
            Counted on your device across {summary.siteCount}{' '}
            {summary.siteCount === 1 ? 'site' : 'sites'}. Nothing about your browsing was sent to
            us to produce this.
          </p>
        </div>
        {state.gpc && <Badge variant="outline">Sending opt-out signal</Badge>}
      </div>

      {summary.topCompany && (
        <p className="text-sm">
          <span className="font-medium">{summary.topCompany.company}</span> was present on {reach}%
          of the sites you visited.
        </p>
      )}

      <ul className="divide-y rounded-md border">
        {summary.companies.slice(0, 8).map((company) => (
          <li key={company.company} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <div>
              <p className="text-sm font-medium">{company.company}</p>
              <p className="text-xs text-muted-foreground">
                {CATEGORY_LABEL[company.category] ?? company.category} · on {company.sites} of{' '}
                {summary.siteCount} sites
              </p>
            </div>
            {company.identified ? (
              <Button size="sm" variant="outline" asChild>
                <Link
                  href={`/privacy?collector=${encodeURIComponent(company.company)}`}
                >
                  Ask them what they hold
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">No company identified</span>
            )}
          </li>
        ))}
      </ul>

      {summary.skipped > 0 && (
        <p className="text-sm text-muted-foreground">
          {summary.skipped} {summary.skipped === 1 ? 'visit was' : 'visits were'} left out
          entirely. Health, finance, legal, adult, and support sites are excluded by default,
          because the visit itself would be the disclosure.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={saving || isLocked} onClick={keep}>
          Keep this in my vault
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={async () => {
            await clearInsight()
            await refresh()
          }}
        >
          Discard it
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Saving keeps counts and company names, encrypted with your key. It never keeps which
        sites you visited.
      </p>
    </section>
  )
}
