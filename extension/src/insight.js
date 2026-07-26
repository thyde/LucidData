/**
 * LD-206 insight analysis.
 *
 * Pure functions, deliberately. Everything here takes data and returns data,
 * which is what makes "analysis runs entirely on device and issues no network
 * request" a checkable claim rather than a promise: a test reads this file and
 * asserts it contains no fetch, no XMLHttpRequest, no sendBeacon, and no
 * WebSocket. That check is worth more than any amount of prose.
 *
 * It also means every judgement here can be tested against fixtures rather
 * than against a live page.
 */

import { classifyTracker } from './trackers.js'
import { sensitiveCategory, toStorableDomain } from './url-safety.js'

/**
 * Turn one page load into a collection profile.
 *
 * `resourceUrls` is what the page itself requested, read in the page from the
 * performance timeline. Nothing here has seen a network request; it has seen a
 * list of URLs that already happened.
 *
 * Returns null for a sensitive site. That is not a filter applied later, it is
 * a refusal to produce a record at all, so there is nothing downstream to
 * forget to exclude.
 */
export function analysePage(pageUrl, resourceUrls, now = Date.now()) {
  const site = toStorableDomain(pageUrl)
  if (!site) return null

  const category = sensitiveCategory(site)
  if (category) {
    // Report the refusal so the UI can say a site was skipped and why,
    // without saying which site.
    return { skipped: true, reason: category }
  }

  const thirdParties = new Map()
  for (const url of resourceUrls ?? []) {
    const domain = toStorableDomain(url)
    if (!domain || domain === site) continue

    const known = classifyTracker(domain)
    const existing = thirdParties.get(domain)
    if (existing) {
      existing.requests += 1
      continue
    }
    thirdParties.set(domain, {
      domain,
      company: known?.company ?? null,
      category: known?.category ?? 'unknown',
      requests: 1,
    })
  }

  const collectors = Array.from(thirdParties.values()).sort(
    (a, b) => b.requests - a.requests
  )

  return {
    skipped: false,
    site,
    seenAt: now,
    collectors,
    knownCount: collectors.filter((entry) => entry.company !== null).length,
    unknownCount: collectors.filter((entry) => entry.company === null).length,
  }
}

/**
 * Fold a page analysis into the running profile.
 *
 * Counts and timestamps only. The profile never grows a field that could hold
 * a path or a title, because the only way to leak one is to have somewhere to
 * put it.
 */
export function mergeIntoProfile(profile, analysis) {
  const next = {
    sites: { ...(profile?.sites ?? {}) },
    collectors: { ...(profile?.collectors ?? {}) },
    skipped: profile?.skipped ?? 0,
    pagesSeen: (profile?.pagesSeen ?? 0) + 1,
    since: profile?.since ?? analysis?.seenAt ?? Date.now(),
  }

  if (!analysis) return next
  if (analysis.skipped) {
    next.skipped += 1
    return next
  }

  const site = next.sites[analysis.site] ?? { visits: 0, collectors: [] }
  const siteCollectors = new Set(site.collectors)
  for (const collector of analysis.collectors) {
    siteCollectors.add(collector.domain)

    const running = next.collectors[collector.domain] ?? {
      domain: collector.domain,
      company: collector.company,
      category: collector.category,
      requests: 0,
      sites: 0,
    }
    running.requests += collector.requests
    next.collectors[collector.domain] = running
  }

  next.sites[analysis.site] = {
    visits: site.visits + 1,
    collectors: Array.from(siteCollectors),
    lastSeen: analysis.seenAt,
  }

  // Recount site reach rather than incrementing, so a repeat visit does not
  // inflate how widespread a collector looks.
  for (const domain of Object.keys(next.collectors)) {
    next.collectors[domain].sites = Object.values(next.sites).filter((entry) =>
      entry.collectors.includes(domain)
    ).length
  }

  return next
}

/**
 * The headline the user actually reads. Companies, not domains, because
 * "Google was on 34 of the 41 sites you visited" lands and
 * "doubleclick.net: 112" does not.
 */
export function summariseProfile(profile) {
  const collectors = Object.values(profile?.collectors ?? {})
  const siteCount = Object.keys(profile?.sites ?? {}).length

  const byCompany = new Map()
  for (const collector of collectors) {
    const name = collector.company ?? 'Unidentified third party'
    const existing = byCompany.get(name) ?? {
      company: name,
      identified: collector.company !== null,
      category: collector.category,
      requests: 0,
      sites: 0,
      domains: [],
    }
    existing.requests += collector.requests
    existing.sites = Math.max(existing.sites, collector.sites)
    existing.domains.push(collector.domain)
    byCompany.set(name, existing)
  }

  const companies = Array.from(byCompany.values()).sort((a, b) => b.sites - a.sites)

  return {
    siteCount,
    pagesSeen: profile?.pagesSeen ?? 0,
    skipped: profile?.skipped ?? 0,
    since: profile?.since ?? null,
    collectorCount: collectors.length,
    companies,
    topCompany: companies[0] ?? null,
    reach: siteCount > 0 && companies[0] ? companies[0].sites / siteCount : 0,
  }
}

/**
 * The shape written to the vault, if the person chooses to keep it.
 *
 * Counts, categories, and company names. No site list, because which sites
 * someone visited is the disclosive part and an aggregate does not need it.
 *
 * Categories are counted per collector rather than per company on purpose. One
 * company routinely runs an analytics product and an advertising product, and
 * collapsing that to a single category would understate both.
 */
export function toVaultRecord(profile, now = Date.now()) {
  const summary = summariseProfile(profile)
  const collectors = Object.values(profile?.collectors ?? {})
  const countByCategory = (category) =>
    collectors.filter((entry) => entry.category === category).length

  return {
    period_start: new Date(summary.since ?? now).toISOString().slice(0, 10),
    period_end: new Date(now).toISOString().slice(0, 10),
    sites_visited: summary.siteCount,
    collectors_seen: summary.collectorCount,
    sensitive_sites_skipped: summary.skipped,
    top_collector: summary.topCompany?.company ?? null,
    top_collector_reach: summary.topCompany
      ? Math.round((summary.topCompany.sites / Math.max(summary.siteCount, 1)) * 100)
      : null,
    advertising_collectors: countByCategory('advertising'),
    analytics_collectors: countByCategory('analytics'),
    fingerprinting_collectors: countByCategory('fingerprinting'),
    source: 'lucid-extension',
  }
}
