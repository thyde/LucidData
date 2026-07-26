/**
 * LD-206 URL safety.
 *
 * The single rule this module exists to enforce: only a registrable domain is
 * ever kept. Not the path, not the query string, not the fragment.
 *
 * That is not fussiness. A path carries the article someone read, a query
 * string routinely carries a session token or an email address, and a fragment
 * carries whatever the page put there. Storing any of it would make a feature
 * about surveillance into a small act of surveillance.
 *
 * This module performs no network request and imports nothing. A test reads its
 * own source to prove that, because "analysis is local" is the claim the whole
 * feature rests on.
 */

/**
 * Public-suffix handling without shipping the full list.
 *
 * A complete PSL is large and needs updating. These are the multi-part
 * suffixes that actually appear in tracker and site domains. Anything not
 * listed falls back to the last two labels, which is right for the vast
 * majority and errs towards keeping less rather than more.
 */
const MULTI_PART_SUFFIXES = [
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'net.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr', 'go.kr',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
  'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw',
  'co.za', 'org.za',
  'com.pl', 'com.es', 'com.pt', 'com.gr', 'com.ua', 'com.ru',
  'gouv.fr',
]

/**
 * Reduce a hostname to what identifies the organization behind it.
 *
 * `www.analytics.example.co.uk` becomes `example.co.uk`. A subdomain would
 * tell us which product someone used, which is closer to content than to a
 * collector's identity.
 */
export function registrableDomain(hostname) {
  if (typeof hostname !== 'string') return null
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!host) return null

  // An IP address has no registrable domain, and keeping one would be keeping
  // an address rather than an organization.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null
  if (host.includes(':') || host.startsWith('[')) return null
  if (host === 'localhost') return null

  const labels = host.split('.').filter(Boolean)
  if (labels.length < 2) return null

  const lastTwo = labels.slice(-2).join('.')
  if (MULTI_PART_SUFFIXES.includes(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.')
  }
  return lastTwo
}

/**
 * The only function allowed to turn a URL into something storable.
 *
 * Returns a bare registrable domain or null. There is no code path that
 * returns a path, a query string, or a fragment, which is what makes the
 * sanitization test meaningful rather than decorative.
 */
export function toStorableDomain(url) {
  if (typeof url !== 'string') return null
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  // Anything not fetched over the network is not a collector.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return registrableDomain(parsed.hostname)
}

/**
 * Categories where the domain alone discloses a condition or a circumstance.
 *
 * Someone visiting a cancer charity, a debt advice line, an immigration
 * solicitor, or a domestic abuse service has disclosed something by the visit.
 * Recording that a tracker was present there would create exactly the record
 * this feature exists to warn people about, so these are excluded from
 * anything persisted, by default and without asking.
 */
export const SENSITIVE_CATEGORIES = {
  health: [
    'nhs.uk', 'webmd.com', 'mayoclinic.org', 'healthline.com', 'drugs.com',
    'plannedparenthood.org', 'cancerresearchuk.org', 'macmillan.org.uk',
    'mind.org.uk', 'samaritans.org', 'alcoholics-anonymous.org.uk',
    'patient.info', 'goodrx.com', 'zocdoc.com',
  ],
  finance: [
    'stepchange.org', 'nationaldebtline.org', 'citizensadvice.org.uk',
    'creditkarma.com', 'experian.com', 'equifax.com', 'transunion.com',
    'moneyhelper.org.uk',
  ],
  legal: [
    'lawsociety.org.uk', 'justice.gov', 'uscourts.gov',
    'refugeecouncil.org.uk', 'immigrationadvice.org',
  ],
  adult: [
    'pornhub.com', 'xvideos.com', 'xhamster.com', 'onlyfans.com', 'redtube.com',
  ],
  government: [
    'irs.gov', 'ssa.gov', 'benefits.gov', 'service.gov.uk', 'uscis.gov',
  ],
  support: [
    'refuge.org.uk', 'womensaid.org.uk', 'thehotline.org', 'switchboard.lgbt',
    'stonewall.org.uk', 'mermaidsuk.org.uk',
  ],
}

/** Substrings that make a domain sensitive whatever its registrar. */
const SENSITIVE_SUBSTRINGS = [
  'porn', 'xxx', 'escort', 'nsfw',
  'abortion', 'rehab', 'addiction', 'suicide', 'selfharm',
  'bankruptcy', 'payday', 'debtadvice',
  'immigration', 'asylum', 'deportation',
]

const SENSITIVE_LOOKUP = new Map()
for (const [category, domains] of Object.entries(SENSITIVE_CATEGORIES)) {
  for (const domain of domains) SENSITIVE_LOOKUP.set(domain, category)
}

/**
 * Is this a site where the visit itself is the disclosure?
 *
 * Returns the category name, or null. Deliberately errs towards excluding: a
 * false positive means one site missing from a report, and a false negative
 * means recording something that should never have been recorded.
 */
export function sensitiveCategory(domain) {
  if (!domain) return null
  const direct = SENSITIVE_LOOKUP.get(domain)
  if (direct) return direct

  for (const substring of SENSITIVE_SUBSTRINGS) {
    if (domain.includes(substring)) return 'inferred'
  }
  return null
}

export function isSensitiveDomain(domain) {
  return sensitiveCategory(domain) !== null
}
