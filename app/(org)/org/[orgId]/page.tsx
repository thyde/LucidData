import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { getIssuerOverviewAction } from '@/lib/actions/issuer.actions'
import { listIssuedCredentialsAction } from '@/lib/actions/credential.actions'
import { getBillingOverviewAction } from '@/lib/actions/billing.actions'
import { IssuerSetup } from '@/components/org/issuer-setup'
import { IssueCredential } from '@/components/org/issue-credential'
import { VerifyTool } from '@/components/org/verify-tool'
import { RequestCredentials } from '@/components/org/request-credentials'
import { PlanBilling } from '@/components/org/plan-billing'
import { isStripeConfigured } from '@/lib/stripe/client'

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params

  let membership
  try {
    membership = await requireOrgMembership(orgId)
  } catch {
    notFound()
  }

  const { organization, role } = membership
  const isIssuer = organization.org_type === 'issuer' || organization.org_type === 'both'
  const isVerifier = organization.org_type === 'verifier' || organization.org_type === 'both'
  const overview = isIssuer ? await getIssuerOverviewAction(orgId) : null
  const issued = overview?.domainVerified ? await listIssuedCredentialsAction(orgId) : []
  const usage = await getBillingOverviewAction(orgId)
  const stripeEnabled = isStripeConfigured()

  return (
    <div className="space-y-8">
      <div>
        <Link href="/org" className="text-sm text-muted-foreground hover:text-foreground">
          ← All organizations
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{organization.name}</h1>
            <p className="text-muted-foreground mt-1">
              {organization.email} · {organization.org_type}
            </p>
          </div>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{role}</span>
        </div>
      </div>

      {isIssuer && overview && (
        <div className="space-y-8">
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Issuer setup</h2>
            <IssuerSetup orgId={orgId} overview={overview} />
          </div>
          {overview.domainVerified && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Credentials</h2>
              <IssueCredential orgId={orgId} issued={issued} />
            </div>
          )}
        </div>
      )}

      {isVerifier && (
        <div className="space-y-8">
          <h2 className="text-lg font-medium">Verifier tools</h2>
          <RequestCredentials orgId={orgId} />
          <VerifyTool />
        </div>
      )}

      {organization.data_buyer && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Data marketplace</h2>
          <div className="flex items-center justify-between rounded-lg border bg-background p-5">
            <div>
              <p className="font-medium">Buy consented, anonymized data</p>
              <p className="text-sm text-muted-foreground">
                Create data pools and purchase datasets from individuals who opt in.
              </p>
            </div>
            <Link
              href={`/org/${orgId}/data`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Open buyer portal →
            </Link>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Plan &amp; usage</h2>
        <PlanBilling
          orgId={orgId}
          usage={usage}
          canManageBilling={role === 'owner'}
          stripeEnabled={stripeEnabled}
        />
      </div>
    </div>
  )
}
