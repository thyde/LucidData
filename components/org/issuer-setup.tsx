'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'
import {
  startDomainVerificationAction,
  checkDomainVerificationAction,
  ensureIssuerKeyAction,
} from '@/lib/actions/issuer.actions'
import type { IssuerOverview } from '@/lib/actions/issuer.actions'

interface IssuerSetupProps {
  orgId: string
  overview: IssuerOverview
}

export function IssuerSetup({ orgId, overview }: IssuerSetupProps) {
  const { toast } = useToast()
  const [domain, setDomain] = useState(overview.organization.domain ?? '')
  const [challenge, setChallenge] = useState(overview.dnsChallenge)
  const [verified, setVerified] = useState(overview.domainVerified)
  const [publicKey, setPublicKey] = useState(overview.publicKey)
  const [busy, setBusy] = useState<null | 'start' | 'check' | 'key'>(null)

  async function handleStart() {
    setBusy('start')
    try {
      const record = await startDomainVerificationAction(orgId, domain)
      setChallenge(record)
      setVerified(false)
      toast({ title: 'Verification started', description: 'Add the DNS TXT record, then check verification.' })
    } catch (e) {
      toast({ title: 'Could not start verification', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function handleCheck() {
    setBusy('check')
    try {
      const result = await checkDomainVerificationAction(orgId)
      setVerified(result.verified)
      toast({
        title: result.verified ? 'Domain verified' : 'Not verified yet',
        description: result.message,
        variant: result.verified ? undefined : 'destructive',
      })
      if (result.verified) {
        const key = await ensureIssuerKeyAction(orgId)
        setPublicKey(key)
      }
    } catch (e) {
      toast({ title: 'Verification check failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateKey() {
    setBusy('key')
    try {
      const key = await ensureIssuerKeyAction(orgId)
      setPublicKey(key)
      toast({ title: 'Signing key ready' })
    } catch (e) {
      toast({ title: 'Could not create key', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="border rounded-lg p-5 bg-background space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Domain verification</h2>
          {verified ? (
            <span className="text-xs font-medium text-green-600">Verified</span>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">Not verified</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Verify you control the domain credentials are issued from. Verifiers use this to trust your signatures.
        </p>
        <div className="space-y-2">
          <Label htmlFor="domain">Issuing domain</Label>
          <div className="flex gap-2">
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="university.edu"
            />
            <Button onClick={handleStart} disabled={busy !== null || !domain.trim()}>
              {busy === 'start' ? 'Starting…' : challenge ? 'Restart' : 'Start'}
            </Button>
          </div>
        </div>

        {challenge && !verified && (
          <div className="rounded-md bg-muted p-4 text-sm space-y-2">
            <p className="font-medium">Add this DNS TXT record, then check verification:</p>
            <div className="space-y-1 font-mono text-xs break-all">
              <p><span className="text-muted-foreground">Name:</span> {challenge.recordName}</p>
              <p><span className="text-muted-foreground">Value:</span> {challenge.recordValue}</p>
            </div>
            <Button onClick={handleCheck} disabled={busy !== null} variant="outline" className="mt-2">
              {busy === 'check' ? 'Checking…' : 'Check verification'}
            </Button>
          </div>
        )}
      </section>

      <section className="border rounded-lg p-5 bg-background space-y-4">
        <h2 className="font-medium">Signing key</h2>
        <p className="text-sm text-muted-foreground">
          Credentials are signed with your organization&apos;s Ed25519 key. The public key is shared with verifiers; the private key is encrypted at rest.
        </p>
        {publicKey ? (
          <div className="rounded-md bg-muted p-4 text-sm space-y-1 font-mono text-xs break-all">
            <p><span className="text-muted-foreground">Key ID:</span> {publicKey.keyId}</p>
            <p><span className="text-muted-foreground">Algorithm:</span> {publicKey.alg}</p>
            <p><span className="text-muted-foreground">Public key:</span> {publicKey.publicKey}</p>
          </div>
        ) : (
          <Button onClick={handleCreateKey} disabled={busy !== null} variant="outline">
            {busy === 'key' ? 'Creating…' : 'Create signing key'}
          </Button>
        )}
      </section>
    </div>
  )
}
