import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrgMembership } from '@/lib/middleware/withOrgMember'
import { getIssuerOverviewAction } from '@/lib/actions/issuer.actions'
import { listIssuedCredentialsAction } from '@/lib/actions/credential.actions'
import { getBillingOverviewAction } from '@/lib/actions/billing.actions'
import { getOrganizationApiKeysAction } from '@/lib/actions/organization-api-key.actions'
import { IssuerSetup } from '@/components/org/issuer-setup'
import { IssuerKeyManager } from '@/components/org/issuer-key-manager'
import {
  getKeyLifecycleStatusAction,
  listIssuerPublicKeysAction,
} from '@/lib/actions/issuer-key.actions'
import { IssueCredential } from '@/components/org/issue-credential'
import { VerifyTool } from '@/components/org/verify-tool'
import { RequestCredentials } from '@/components/org/request-credentials'
import { PlanBilling } from '@/components/org/plan-billing'
import { ApiKeyManager } from '@/components/org/api-key-manager'
import { TeamManager } from '@/components/org/team-manager'
import { listOrgTeamAction } from '@/lib/actions/org-team.actions'
import { createClient } from '@/lib/supabase/server'
import { isStripeConfigured } from '@/lib/stripe/client'
import { isEmailDeliveryConfigured } from '@/lib/services/notification-email.service'

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
  const keyStatus = isIssuer ? await getKeyLifecycleStatusAction(orgId) : null
  const issuerKeys = isIssuer ? await listIssuerPublicKeysAction(orgId) : []
  const issued = overview?.domainVerified ? await listIssuedCredentialsAction(orgId) : []
  const usage = await getBillingOverviewAction(orgId)
  const stripeEnabled = isStripeConfigured()
  const emailConfigured = isEmailDeliveryConfigured()
  const apiKeys = role === 'owner' ? await getOrganizationApiKeysAction(orgId) : []
  const team = role === 'owner' ? await listOrgTeamAction(orgId) : null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

      {!emailConfigured && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-medium">Email delivery is not configured</p>
          <p className="mt-1">
            People still see your requests inside LucidData, but no email is sent, so they may not
            know a request is waiting. Set an email transport in this deployment to turn delivery on.
          </p>
        </div>
      )}

      {isIssuer && overview && (
        <div className="space-y-8">
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Issuer setup</h2>
            <IssuerSetup orgId={orgId} overview={overview} />
          </div>
          {keyStatus && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Signing keys</h2>
              <IssuerKeyManager
                orgId={orgId}
                initialStatus={keyStatus}
                initialKeys={issuerKeys}
              />
            </div>
          )}
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

      {role === 'owner' && team && user && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Team</h2>
          <TeamManager
            orgId={orgId}
            currentUserId={user.id}
            initialMembers={team.members}
            initialInvitations={team.invitations}
          />
        </div>
      )}

      {role === 'owner' && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">API keys</h2>
          <ApiKeyManager organizationId={orgId} initialKeys={apiKeys} />
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
