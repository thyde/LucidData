'use client'

import { useEffect, useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { getExportAction } from '@/lib/actions/data-order.actions'

interface ExportDownloadProps {
  orgId: string
  token: string
  expiresAt: string
}

export function ExportDownload({ orgId, token, expiresAt }: ExportDownloadProps) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)

  // The server also rejects expired tokens. This keeps the button in step with
  // the expiry while the page stays open.
  useEffect(() => {
    const expiresAtMs = new Date(expiresAt).getTime()
    const check = () => setExpired(Date.now() >= expiresAtMs)
    check()
    const timer = setInterval(check, 30000)
    return () => clearInterval(timer)
  }, [expiresAt])

  function handleDownload() {
    setBusy(true)
    startTransition(async () => {
      try {
        const data = await getExportAction(orgId, token)
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${data.pool.name.replace(/\s+/g, '-').toLowerCase()}-export.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast({ title: 'Export downloaded', description: `${data.recordCount} record(s)` })
      } catch (err) {
        toast({
          title: 'Download failed',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setBusy(false)
      }
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleDownload}
      disabled={expired || busy || isPending}
    >
      <Download className="h-4 w-4" />
      {expired ? 'Expired' : busy ? 'Preparing…' : 'Download'}
    </Button>
  )
}
