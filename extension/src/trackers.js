/**
 * LD-206 tracker classification.
 *
 * A bundled list, not a lookup service. Asking a server "who is this domain"
 * would send the very browsing data this feature exists to expose, so the list
 * ships with the extension and matching happens on the device.
 *
 * The list is short and honest about it. It covers the collectors that appear
 * on most of the web rather than pretending to be exhaustive, and the UI says
 * so. An unrecognized third party is still reported as a third party; it just
 * does not get a company name.
 */

export const TRACKER_CATEGORIES = {
  advertising: 'Advertising and profiling',
  analytics: 'Analytics and measurement',
  social: 'Social networks',
  fingerprinting: 'Device fingerprinting',
  cdn: 'Content delivery',
  tagmanager: 'Tag management',
}

/**
 * domain -> { company, category }
 *
 * Company is the entity a rights request would be addressed to, which is why
 * several domains map to the same company.
 */
export const TRACKER_DOMAINS = {
  'google-analytics.com': { company: 'Google', category: 'analytics' },
  'analytics.google.com': { company: 'Google', category: 'analytics' },
  'googletagmanager.com': { company: 'Google', category: 'tagmanager' },
  'doubleclick.net': { company: 'Google', category: 'advertising' },
  'googlesyndication.com': { company: 'Google', category: 'advertising' },
  'googleadservices.com': { company: 'Google', category: 'advertising' },
  'google.com': { company: 'Google', category: 'advertising' },
  'gstatic.com': { company: 'Google', category: 'cdn' },
  'youtube.com': { company: 'Google', category: 'social' },

  'facebook.net': { company: 'Meta', category: 'advertising' },
  'facebook.com': { company: 'Meta', category: 'social' },
  'instagram.com': { company: 'Meta', category: 'social' },

  'analytics.tiktok.com': { company: 'TikTok', category: 'advertising' },
  'tiktok.com': { company: 'TikTok', category: 'social' },

  'ads-twitter.com': { company: 'X', category: 'advertising' },
  'twitter.com': { company: 'X', category: 'social' },
  't.co': { company: 'X', category: 'advertising' },

  'linkedin.com': { company: 'Microsoft', category: 'social' },
  'licdn.com': { company: 'Microsoft', category: 'advertising' },
  'clarity.ms': { company: 'Microsoft', category: 'analytics' },
  'bing.com': { company: 'Microsoft', category: 'advertising' },

  'amazon-adsystem.com': { company: 'Amazon', category: 'advertising' },
  'adsystem.com': { company: 'Amazon', category: 'advertising' },

  'criteo.com': { company: 'Criteo', category: 'advertising' },
  'criteo.net': { company: 'Criteo', category: 'advertising' },
  'taboola.com': { company: 'Taboola', category: 'advertising' },
  'outbrain.com': { company: 'Outbrain', category: 'advertising' },
  'pubmatic.com': { company: 'PubMatic', category: 'advertising' },
  'rubiconproject.com': { company: 'Magnite', category: 'advertising' },
  'casalemedia.com': { company: 'Index Exchange', category: 'advertising' },
  'openx.net': { company: 'OpenX', category: 'advertising' },
  'adnxs.com': { company: 'Microsoft', category: 'advertising' },
  'adsrvr.org': { company: 'The Trade Desk', category: 'advertising' },
  'bidswitch.net': { company: 'IPONWEB', category: 'advertising' },
  'smartadserver.com': { company: 'Equativ', category: 'advertising' },
  'yieldmo.com': { company: 'Yieldmo', category: 'advertising' },
  'quantserve.com': { company: 'Quantcast', category: 'advertising' },
  'scorecardresearch.com': { company: 'Comscore', category: 'analytics' },

  'hotjar.com': { company: 'Hotjar', category: 'analytics' },
  'mixpanel.com': { company: 'Mixpanel', category: 'analytics' },
  'segment.com': { company: 'Twilio', category: 'analytics' },
  'segment.io': { company: 'Twilio', category: 'analytics' },
  'amplitude.com': { company: 'Amplitude', category: 'analytics' },
  'fullstory.com': { company: 'FullStory', category: 'analytics' },
  'heap.io': { company: 'Heap', category: 'analytics' },
  'newrelic.com': { company: 'New Relic', category: 'analytics' },
  'sentry.io': { company: 'Sentry', category: 'analytics' },
  'optimizely.com': { company: 'Optimizely', category: 'analytics' },
  'chartbeat.com': { company: 'Chartbeat', category: 'analytics' },
  'branch.io': { company: 'Branch', category: 'analytics' },
  'appsflyer.com': { company: 'AppsFlyer', category: 'analytics' },
  'adjust.com': { company: 'Adjust', category: 'analytics' },
  'kochava.com': { company: 'Kochava', category: 'analytics' },

  'onetrust.com': { company: 'OneTrust', category: 'tagmanager' },
  'cookielaw.org': { company: 'OneTrust', category: 'tagmanager' },
  'trustarc.com': { company: 'TrustArc', category: 'tagmanager' },
  'usercentrics.eu': { company: 'Usercentrics', category: 'tagmanager' },

  'fpjs.io': { company: 'FingerprintJS', category: 'fingerprinting' },
  'fingerprintjs.com': { company: 'FingerprintJS', category: 'fingerprinting' },
  'iovation.com': { company: 'TransUnion', category: 'fingerprinting' },
  'threatmetrix.com': { company: 'LexisNexis', category: 'fingerprinting' },
  'perimeterx.net': { company: 'HUMAN', category: 'fingerprinting' },
}

/**
 * What a domain is, on this device.
 *
 * Returns null for a domain that is not a known collector. The caller still
 * reports it as a third party when it differs from the site; not knowing who
 * someone is does not make them absent.
 */
export function classifyTracker(domain) {
  if (!domain) return null
  return TRACKER_DOMAINS[domain] ?? null
}

/** The distinct companies behind a set of domains. */
export function companiesFor(domains) {
  const companies = new Map()
  for (const domain of domains) {
    const known = classifyTracker(domain)
    if (!known) continue
    const existing = companies.get(known.company)
    if (existing) {
      existing.domains.push(domain)
    } else {
      companies.set(known.company, {
        company: known.company,
        category: known.category,
        domains: [domain],
      })
    }
  }
  return Array.from(companies.values())
}

export const TRACKER_LIST_NOTE =
  'This list ships with the extension and covers the collectors that appear on most of the web. It is not exhaustive. A third party we cannot name is still counted, just without a company against it.'
