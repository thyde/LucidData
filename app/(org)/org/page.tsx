import Link from 'next/link'
import { getMyOrganizations } from '@/lib/middleware/withOrgMember'
import { Button } from '@/components/ui/button'

export default async function OrgDashboardPage() {
  const memberships = await getMyOrganizations()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your organizations</h1>
          <p className="text-muted-foreground mt-1">
            Manage the organizations you issue or verify credentials for.
          </p>
        </div>
        <Button asChild>
          <Link href="/org/register">New organization</Link>
        </Button>
      </div>

      {memberships.length === 0 ? (
        <div className="border rounded-lg p-8 text-center bg-background">
          <p className="text-muted-foreground">
            You are not part of any organization yet.
          </p>
          <Button asChild className="mt-4">
            <Link href="/org/register">Register an organization</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {memberships.map(({ organization, role }) => (
            <li key={organization.id}>
              <Link
                href={`/org/${organization.id}`}
                className="border rounded-lg p-4 bg-background flex items-center justify-between hover:border-foreground/30 transition-colors"
              >
                <div>
                  <p className="font-medium">{organization.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {organization.email} · {organization.org_type}
                  </p>
                </div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {role}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
