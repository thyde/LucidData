import { verifyConsentReceiptById } from '@/lib/services/consent-receipt.service'
import { canonicalConsentReceipt } from '@/lib/crypto/consent-receipt'

/**
 * LD-303 public consent receipt verification.
 *
 * Reachable without an account so either party can present a receipt for
 * checking. Shows the agreed terms and whether the signature still covers them.
 * It deliberately shows no vault content, because a receipt never carries any.
 */

function formatDate(value: string | null): string {
  if (!value) return 'No end date'
  return new Date(value).toLocaleDateString()
}

const EVENT_LABEL: Record<string, string> = {
  granted: 'Consent granted',
  extended: 'Consent extended',
  revoked: 'Consent revoked',
}

export default async function VerifyConsentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await verifyConsentReceiptById(id)

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <span className="font-semibold text-lg">Lucid</span>
          <span className="text-muted-foreground text-sm"> · consent receipt</span>
        </div>

        {!result.found ? (
          <div className="border rounded-lg p-8 bg-background text-center">
            <h1 className="text-xl font-semibold">Receipt not found</h1>
            <p className="text-muted-foreground mt-2">
              No consent receipt exists with this identifier.
            </p>
          </div>
        ) : (
          <div className="border rounded-lg bg-background overflow-hidden">
            <div
              className={
                result.valid
                  ? 'bg-green-50 border-b border-green-200 p-5'
                  : 'bg-red-50 border-b border-red-200 p-5'
              }
            >
              <p
                className={
                  result.valid ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'
                }
              >
                {result.valid ? 'Signature verified' : 'Signature does not match'}
              </p>
              <p
                className={
                  result.valid ? 'text-green-700 text-sm mt-1' : 'text-red-700 text-sm mt-1'
                }
              >
                {result.valid
                  ? 'The terms below are exactly what was signed. Any change would break this check.'
                  : 'The stored terms no longer match the signature, so this receipt cannot be trusted.'}
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <h1 className="text-xl font-semibold">
                  {EVENT_LABEL[result.payload.event] ?? result.payload.event}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Issued {new Date(result.payload.issuedAt).toLocaleString()}
                </p>
              </div>

              <dl className="divide-y border rounded-md">
                <div className="flex justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-muted-foreground">Recipient</dt>
                  <dd className="font-medium text-right">
                    {result.payload.consent.recipient.name ??
                      result.payload.consent.recipient.id}
                  </dd>
                </div>
                <div className="px-4 py-2 text-sm">
                  <dt className="text-muted-foreground">Purpose</dt>
                  <dd className="mt-1">{result.payload.consent.purpose}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-muted-foreground">Permitted actions</dt>
                  <dd className="font-medium text-right">
                    {result.payload.consent.permittedActions.join(', ')}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-muted-foreground">Data categories</dt>
                  <dd className="font-medium text-right">
                    {result.payload.consent.dataCategories.length > 0
                      ? result.payload.consent.dataCategories.join(', ')
                      : 'Not limited by category'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-muted-foreground">Access</dt>
                  <dd className="font-medium text-right">
                    {result.payload.consent.accessMode === 'one_time'
                      ? 'One-time delivery'
                      : 'Continuous within the window'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-muted-foreground">Window</dt>
                  <dd className="font-medium text-right">
                    {formatDate(result.payload.consent.startDate)} to{' '}
                    {formatDate(result.payload.consent.endDate)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-muted-foreground">Legal basis</dt>
                  <dd className="font-medium text-right">
                    {result.payload.consent.legalBasis}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-muted-foreground">Compensation</dt>
                  <dd className="font-medium text-right">
                    {result.payload.consent.compensation
                      ? `${(result.payload.consent.compensation.amountCents / 100).toFixed(2)} ${result.payload.consent.compensation.currency}`
                      : 'None'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-muted-foreground">Current state</dt>
                  <dd className="font-medium text-right">
                    {result.payload.consent.revoked ? 'Revoked' : 'Not revoked'}
                  </dd>
                </div>
              </dl>

              <div className="px-4 py-3 rounded-md border bg-muted/40 text-sm">
                <p className="font-medium">Onward use</p>
                <p className="text-muted-foreground mt-1">
                  {result.payload.consent.onwardUseLimit}
                </p>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Receipt {result.payload.receiptId}</p>
                {result.payload.supersedesReceiptId && (
                  <p>Supersedes receipt {result.payload.supersedesReceiptId}</p>
                )}
                <p>
                  Policy version {result.payload.policyVersion} · receipt format{' '}
                  {result.payload.version} · signing key {result.keyId}
                </p>
                <p>
                  This receipt records the terms of a consent grant. It contains no vault data.
                </p>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Show the exact signed bytes
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                  {canonicalConsentReceipt(result.payload)}
                </pre>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
