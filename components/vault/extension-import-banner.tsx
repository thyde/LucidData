'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  clearPendingExport,
  getPendingExport,
  type PendingExport,
} from '@/lib/extension/bridge-client'
import { IMPORT_FILE_EVENT } from '@/components/vault/vault-import-dialog'

/**
 * LD-205: an export the extension noticed, offered here rather than pushed.
 *
 * Nothing is read until the person accepts. The extension knows a file
 * finished downloading and where it came from; it opens the file only when
 * this asks for it, and the bytes go straight into the browser import
 * pipeline, which encrypts before anything is stored.
 */
export function ExtensionImportBanner() {
  const [pending, setPending] = useState<PendingExport | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    // Deferred so the vault list renders before the bridge is probed. A missing
    // extension resolves to null after a short wait, which is the normal case.
    const timer = setTimeout(() => {
      getPendingExport()
        .then((result) => {
          if (active) setPending(result)
        })
        .catch(() => undefined)
    }, 0)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [])

  const accept = useCallback(async () => {
    if (!pending) return
    setBusy(true)
    try {
      const name = pending.filename.split(/[\\/]/).pop() ?? 'export.json'
      const file = new File([pending.text], name, { type: 'application/octet-stream' })
      window.dispatchEvent(new CustomEvent(IMPORT_FILE_EVENT, { detail: file }))
      await clearPendingExport()
      setPending(null)
    } finally {
      setBusy(false)
    }
  }, [pending])

  const dismiss = useCallback(async () => {
    await clearPendingExport()
    setPending(null)
  }, [])

  if (!pending) return null

  const name = pending.filename.split(/[\\/]/).pop()

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 p-4"
    >
      <div>
        <p className="font-medium">A {pending.providerLabel} export is ready to import</p>
        <p className="text-sm text-muted-foreground">
          {name}. It is read in this browser and encrypted with your key before anything is
          stored.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={accept}>
          Import it
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  )
}
