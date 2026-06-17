'use client'

import { useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { getExportAction } from '@/lib/actions/data-order.actions'

interface ExportDownloadProps {
  orgId: string
  token: string
}

export function ExportDownload({ orgId, token }: ExportDownloadProps) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

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
    <Button size="sm" variant="outline" onClick={handleDownload} disabled={busy || isPending}>
      <Download className="h-4 w-4" />
      {busy ? 'Preparing…' : 'Download'}
    </Button>
  )
}
