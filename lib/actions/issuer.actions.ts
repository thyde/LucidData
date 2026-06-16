'use server'

import crypto from 'crypto'
import { promises as dns } from 'dns'
import { createServiceClient } from '@/lib/supabase/service'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { getActiveIssuerKey, getOrCreateActiveIssuerKey, getIssuerPublicKey } from '@/lib/services/issuer-key.service'
import type { IssuerPublicKey } from '@/lib/services/issuer-key.service'
import type { Organization } from '@/types/database.types'

const TXT_RECORD_PREFIX = '_lucid-verify'

export interface IssuerOverview {
  organization: Pick<Organization, 'id' | 'name' | 'org_type' | 'domain' | 'verified_at'>
  isIssuer: boolean
  domainVerified: boolean
  /** DNS TXT record the issuer must publish to prove domain ownership. */
  dnsChallenge: { recordName: string; recordValue: string } | null
  publicKey: IssuerPublicKey | null
}

/** Membership + issuer-capability guard. Returns the org row. */
async function requireIssuerOrg(organizationId: string): Promise<Organization> {
  const { organization } = await requireOrgMembership(organizationId, ['owner', 'issuer_admin'])
  if (organization.org_type !== 'issuer' && organization.org_type !== 'both') {
    throw new Error('This organization is not configured as an issuer')
  }
  return organization
}

function buildChallenge(domain: string | null, token: string | null) {
  if (!domain || !token) return null
  return {
    recordName: `${TXT_RECORD_PREFIX}.${domain}`,
    recordValue: `lucid-verify=${token}`,
  }
}

export async function getIssuerOverviewAction(organizationId: string): Promise<IssuerOverview> {
  const organization = await requireIssuerOrg(organizationId)
  const publicKey = await getIssuerPublicKey(organizationId)

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      org_type: organization.org_type,
      domain: organization.domain,
      verified_at: organization.verified_at,
    },
    isIssuer: true,
    domainVerified: Boolean(organization.verified_at),
    dnsChallenge: buildChallenge(organization.domain, organization.domain_verification_token),
    publicKey,
  }
}

/**
 * Set (or update) the issuer's domain and (re)issue a DNS TXT challenge token.
 * Returns the record the issuer must publish.
 */
export async function startDomainVerificationAction(
  organizationId: string,
  domain: string
): Promise<{ recordName: string; recordValue: string }> {
  await requireIssuerOrg(organizationId)

  const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
    throw new Error('Enter a valid domain, e.g. university.edu')
  }

  const token = crypto.randomBytes(16).toString('hex')
  const service = createServiceClient()
  const { error } = await service
    .from('organizations')
    .update({ domain: normalized, domain_verification_token: token, verified_at: null })
    .eq('id', organizationId)
  if (error) throw error

  return buildChallenge(normalized, token)!
}

/**
 * Look up the DNS TXT challenge. On success, mark the org verified and ensure a
 * signing key exists so the issuer can start issuing credentials immediately.
 */
export async function checkDomainVerificationAction(
  organizationId: string
): Promise<{ verified: boolean; message: string }> {
  const organization = await requireIssuerOrg(organizationId)
  if (!organization.domain || !organization.domain_verification_token) {
    return { verified: false, message: 'Start domain verification first.' }
  }

  const expected = `lucid-verify=${organization.domain_verification_token}`
  const recordName = `${TXT_RECORD_PREFIX}.${organization.domain}`

  let records: string[][]
  try {
    records = await dns.resolveTxt(recordName)
  } catch {
    return { verified: false, message: `No TXT record found at ${recordName}. DNS can take a few minutes to propagate.` }
  }

  const found = records.some((chunks) => chunks.join('').trim() === expected)
  if (!found) {
    return { verified: false, message: `TXT record at ${recordName} did not match. Check the value and try again.` }
  }

  const service = createServiceClient()
  const { error } = await service
    .from('organizations')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', organizationId)
  if (error) throw error

  await getOrCreateActiveIssuerKey(organizationId)
  return { verified: true, message: 'Domain verified. Your signing key is ready.' }
}

/** Generate the issuer signing key on demand (also created on verification). */
export async function ensureIssuerKeyAction(organizationId: string): Promise<IssuerPublicKey> {
  await requireIssuerOrg(organizationId)
  await getOrCreateActiveIssuerKey(organizationId)
  const publicKey = await getIssuerPublicKey(organizationId)
  if (!publicKey) throw new Error('Failed to create issuer key')
  return publicKey
}

/** Used by the active-key check in the UI without forcing key creation. */
export async function getActiveIssuerKeyAction(organizationId: string): Promise<IssuerPublicKey | null> {
  await requireIssuerOrg(organizationId)
  const key = await getActiveIssuerKey(organizationId)
  return key ? { keyId: key.key_id, alg: 'ed25519', publicKey: key.public_key } : null
}
