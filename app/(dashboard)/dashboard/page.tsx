import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome to your personal data bank
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Vault</CardTitle>
            <CardDescription>Manage your encrypted data</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold mb-4">3 entries</p>
            <Link href="/dashboard/vault">
              <Button variant="outline" className="w-full">
                View Vault
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consents</CardTitle>
            <CardDescription>Control data access permissions</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold mb-4">2 active</p>
            <Link href="/dashboard/consent">
              <Button variant="outline" className="w-full">
                Manage Consents
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
            <CardDescription>Track all data access events</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold mb-4">4 events</p>
            <Link href="/dashboard/audit">
              <Button variant="outline" className="w-full">
                View Log
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
          <CardDescription>Get started with Lucid</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start space-x-4">
            <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <h3 className="font-semibold">Add data to your vault</h3>
              <p className="text-sm text-muted-foreground">
                Store your personal data securely with AES-256 encryption
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-4">
            <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold">Grant consent for data access</h3>
              <p className="text-sm text-muted-foreground">
                Control who can access your data and for what purpose
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-4">
            <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <h3 className="font-semibold">Monitor audit trail</h3>
              <p className="text-sm text-muted-foreground">
                See exactly who accessed your data and when
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
