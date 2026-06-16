'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface OrgRegistration {
  organization: { id: string; name: string; email: string }
  api_key: string
  message: string
}

export default function OrgRegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', website: '', org_type: 'verifier' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OrgRegistration | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/org/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Registration failed')
        return
      }
      setResult(data)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-green-600">Registration successful</h1>
          <p className="text-muted-foreground mt-1">Welcome, {result.organization.name}</p>
        </div>
        <div className="border border-yellow-300 rounded-lg p-6 bg-yellow-50 space-y-3">
          <p className="font-semibold text-yellow-900">Your API key — save this now</p>
          <p className="text-sm text-yellow-800">This key will never be shown again. Store it securely.</p>
          <code className="block bg-white border rounded p-3 text-sm font-mono break-all select-all">
            {result.api_key}
          </code>
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          <p className="font-medium">Getting started with the Lucid API:</p>
          <p>Include your API key in all requests as a Bearer token:</p>
          <code className="block bg-muted rounded p-3 text-xs">
            {'Authorization: Bearer ' + result.api_key}
          </code>
          <p className="mt-3">Available endpoints:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>POST /api/org/consent-request — request user consent</li>
            <li>GET /api/org/verify-consent?user_email= — verify active consent</li>
            <li>GET /api/org/consent-requests — list your sent requests</li>
          </ul>
        </div>
        <Button asChild className="w-full">
          <Link href="/org">Go to organization portal</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Register your organization</h1>
        <p className="text-muted-foreground mt-1">
          Get API access to send consent requests and verify data access permissions.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Organization name</Label>
          <Input id="name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Research Inc." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Contact email</Label>
          <Input id="email" type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="data@acme.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website (optional)</Label>
          <Input id="website" type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://acme.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org_type">Organization type</Label>
          <select
            id="org_type"
            aria-label="Organization type"
            value={form.org_type}
            onChange={e => setForm(f => ({ ...f, org_type: e.target.value }))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="verifier">Verifier — verify credentials others hold</option>
            <option value="issuer">Issuer — issue credentials (e.g. diplomas)</option>
            <option value="both">Both — issue and verify</option>
          </select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Registering...' : 'Register and get API key'}
        </Button>
      </form>
    </div>
  )
}
