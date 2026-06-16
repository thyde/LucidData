'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Lets a verifier paste a share link or token and open the public verification
 * page, which checks the issuer signature server-side.
 */
export function VerifyTool() {
  const [value, setValue] = useState('')

  function open() {
    const trimmed = value.trim()
    if (!trimmed) return
    // Accept either a full /verify/<token> URL or a bare token.
    const match = trimmed.match(/verify\/([^/?#]+)/)
    const token = match ? match[1] : trimmed
    window.open(`/verify/${token}`, '_blank', 'noopener')
  }

  return (
    <section className="border rounded-lg p-5 bg-background space-y-4">
      <div>
        <h2 className="font-medium">Verify a credential</h2>
        <p className="text-sm text-muted-foreground">
          Paste a share link a candidate sent you to confirm it was issued by a trusted source.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="verify-token">Share link or token</Label>
        <div className="flex gap-2">
          <Input
            id="verify-token"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://…/verify/…"
          />
          <Button onClick={open} disabled={!value.trim()}>Open</Button>
        </div>
      </div>
    </section>
  )
}
