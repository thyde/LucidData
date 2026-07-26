'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getConsentReceiptsAction } from '@/lib/actions/consent-receipt.actions'
import { formatDateTime } from '@/lib/utils/date-formatter'
import { Download, FileCheck } from 'lucide-react'
import type { ConsentReceipt } from '@/types/database.types'

const EVENT_LABEL: Record<string, string> = {
  granted: 'Granted',
  extended: 'Extended',
  revoked: 'Revoked',
}

/**
 * LD-303: the signed receipts for one consent. Each state change produces a new
 * receipt, so this is a short history rather than a single document. Downloads
 * are built in the browser from data already loaded.
 */
export function ConsentReceipts({ consentId }: { consentId: string }) {
  const [receipts, setReceipts] = useState<ConsentReceipt[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getConsentReceiptsAction(consentId)
      .then((rows) => {
        if (!cancelled) setReceipts(rows)
      })
      .catch(() => {
        if (!cancelled) setError('Receipts could not be loaded.')
      })
    return () => {
      cancelled = true
    }
  }, [consentId])

  function download(receipt: ConsentReceipt) {
    const document = {
      receiptId: receipt.id,
      signature: receipt.signature,
      keyId: receipt.key_id,
      verifyAt: `${window.location.origin}/verify/receipt/${receipt.id}`,
      payload: receipt.payload,
    }
    const blob = new Blob([JSON.stringify(document, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `consent-receipt-${receipt.id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <FileCheck className="h-4 w-4" />
        Receipts
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        A signed record of what you agreed to, at each point it changed. Download a copy or
        share the verification link with the recipient.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && receipts === null && (
        <p className="text-sm text-muted-foreground">Loading receipts...</p>
      )}
      {!error && receipts?.length === 0 && (
        <p className="text-sm text-muted-foreground">No receipts yet.</p>
      )}

      {receipts && receipts.length > 0 && (
        <ul className="divide-y border rounded-md">
          {receipts.map((receipt) => (
            <li key={receipt.id} className="flex items-center justify-between gap-4 px-4 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {EVENT_LABEL[receipt.event] ?? receipt.event}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(receipt.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/verify/receipt/${receipt.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Verify
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => download(receipt)}
                  aria-label={`Download the ${EVENT_LABEL[receipt.event] ?? receipt.event} receipt`}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
