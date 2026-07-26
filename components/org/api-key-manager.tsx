'use client'

import { useState, useTransition } from 'react'
import { Copy, KeyRound, RefreshCw, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/lib/hooks/use-toast'
import {
  revokeOrganizationApiKeyAction,
  rotateOrganizationApiKeyAction,
} from '@/lib/actions/organization-api-key.actions'
import type { OrganizationApiKeyMetadata } from '@/lib/repositories/organization-api-key.repository'

interface ApiKeyManagerProps {
  organizationId: string
  initialKeys: OrganizationApiKeyMetadata[]
}

function displayDate(value: string | null): string {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}

export function ApiKeyManager({ organizationId, initialKeys }: ApiKeyManagerProps) {
  const { toast } = useToast()
  const [keys, setKeys] = useState(initialKeys)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function rotateKey() {
    startTransition(async () => {
      try {
        const result = await rotateOrganizationApiKeyAction(organizationId, 'Primary key')
        setKeys((current) => [
          result.key,
          ...current.map((key) =>
            key.status === 'active'
              ? { ...key, status: 'rotated', revoked_at: result.key.created_at }
              : key
          ),
        ])
        setNewKey(result.apiKey)
        toast({ title: 'API key rotated' })
      } catch (error) {
        toast({
          title: 'Could not rotate API key',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  function revokeKey(keyId: string) {
    startTransition(async () => {
      try {
        const revoked = await revokeOrganizationApiKeyAction(organizationId, keyId)
        setKeys((current) => current.map((key) => (key.id === keyId ? revoked : key)))
        setNewKey(null)
        toast({ title: 'API key revoked' })
      } catch (error) {
        toast({
          title: 'Could not revoke API key',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      }
    })
  }

  async function copyNewKey() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    toast({ title: 'API key copied' })
  }

  const activeKey = keys.find((key) => key.status === 'active')

  return (
    <div className="space-y-4 border p-5 bg-background rounded-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">API access</p>
          <p className="text-sm text-muted-foreground">
            Use API keys for consent and credential integrations.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isPending}>
              <RefreshCw /> Rotate key
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rotate this API key?</AlertDialogTitle>
              <AlertDialogDescription>
                The current key will stop working immediately. Update every integration with the
                new key before closing the next screen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={rotateKey}>Rotate key</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {newKey && (
        <div className="space-y-3 border border-yellow-300 bg-yellow-50 p-4 rounded-md">
          <p className="font-medium text-yellow-950">Save the new key now</p>
          <p className="text-sm text-yellow-900">It will not be shown again after this page closes.</p>
          <code className="block break-all border bg-white p-3 text-sm">{newKey}</code>
          <Button size="sm" variant="outline" onClick={copyNewKey}>
            <Copy /> Copy key
          </Button>
        </div>
      )}

      {activeKey ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">
                {activeKey.name} {activeKey.key_suffix ? `ending in ${activeKey.key_suffix}` : ''}
              </p>
              <p className="text-muted-foreground">Last used: {displayDate(activeKey.last_used_at)}</p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={isPending}>
                <ShieldX /> Revoke
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
                <AlertDialogDescription>
                  Integrations using this key will stop working. Rotate instead if you need a
                  replacement key.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => revokeKey(activeKey.id)}
                >
                  Revoke key
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <p className="border-t pt-4 text-sm text-destructive">
          This organization has no active API key. Rotate a key to restore API access.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Revoked and rotated keys remain in the audit history, but their hashes are never displayed.
      </p>
    </div>
  )
}