'use client'

import { useState } from 'react'
import { Copy, Download, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'

interface RecoveryCodeDisplayProps {
  code: string
}

// Presentational, one-time display of a generated recovery code with copy/download.
export function RecoveryCodeDisplay({ code }: RecoveryCodeDisplayProps) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast({ title: 'Recovery code copied' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' })
    }
  }

  function downloadCode() {
    const contents =
      'LucidData vault recovery code\n\n' +
      `${code}\n\n` +
      'Keep this somewhere safe and private. It is the only way to recover your\n' +
      'vault if you forget your password. Anyone with this code and a password\n' +
      'reset could unlock your vault, so do not share it.\n'
    const blob = new Blob([contents], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lucid-recovery-code.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted p-4 text-center font-mono text-lg tracking-wider break-all">
        {code}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copyCode}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={downloadCode}>
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Save this code now. It is shown once and is the only way to recover your vault if you
        forget your password.
      </p>
    </div>
  )
}
