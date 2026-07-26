import { AcceptInvitation } from '@/components/org/accept-invitation'

export default async function OrgInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <div className="mx-auto max-w-lg">
      <AcceptInvitation token={token} />
    </div>
  )
}
