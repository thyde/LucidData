'use client'

import { useEffect, useState, useTransition } from 'react'
import { DollarSign, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/use-toast'
import { isIdentifierField } from '@/lib/crypto/anonymize'
import {
  getFieldMonetizationAction,
  setFieldMonetizationAction,
} from '@/lib/actions/monetization.actions'

interface FieldMonetizationToggleProps {
  vaultDataId: string
  category: string
  fields: string[]
}

export function FieldMonetizationToggle({
  vaultDataId,
  category,
  fields,
}: FieldMonetizationToggleProps) {
  const { toast } = useToast()
  const [optedIn, setOptedIn] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getFieldMonetizationAction(vaultDataId)
      .then((rows) => {
        if (!active) return
        const map: Record<string, boolean> = {}
        for (const row of rows) map[row.field_key] = row.opted_in
        setOptedIn(map)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => {
      active = false
    }
  }, [vaultDataId])

  const sellableFields = fields.filter((f) => !isIdentifierField(f))

  function toggle(key: string) {
    setOptedIn((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await setFieldMonetizationAction({
          vault_data_id: vaultDataId,
          category,
          fields: sellableFields.map((f) => ({ field_key: f, opted_in: !!optedIn[f] })),
        })
        toast({ title: 'Sharing preferences saved' })
      } catch {
        toast({ title: 'Could not save', variant: 'destructive' })
      }
    })
  }

  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">No structured fields to monetize.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Choose which fields you allow to be sold. Identifiers can never be sold.
      </p>
      <ul className="space-y-1">
        {fields.map((field) => {
          const identifier = isIdentifierField(field)
          const on = !!optedIn[field]
          return (
            <li key={field} className="flex items-center justify-between rounded-md border p-2">
              <span className="text-sm">{field}</span>
              {identifier ? (
                <Badge variant="destructive" className="gap-1">
                  <Lock className="h-3 w-3" /> Private
                </Badge>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant={on ? 'default' : 'outline'}
                  onClick={() => toggle(field)}
                  className="gap-1"
                >
                  {on ? <DollarSign className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {on ? 'For sale' : 'Private'}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <Button size="sm" onClick={handleSave} disabled={!loaded || isPending}>
        {isPending ? 'Saving…' : 'Save sharing preferences'}
      </Button>
    </div>
  )
}
