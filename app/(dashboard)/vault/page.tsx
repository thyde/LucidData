'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface VaultEntry {
  id: string;
  label: string;
  category: string;
  description?: string;
  tags: string[];
  createdAt: string;
}

export default function VaultPage() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/vault')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        setEntries(Array.isArray(data) ? data : []);
        setError(null);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching vault:', error);
        setError(error instanceof Error ? error.message : 'Failed to load vault entries');
        setEntries([]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Vault</h1>
            <p className="text-muted-foreground mt-1">
              Your encrypted personal data storage
            </p>
          </div>
          <Button disabled>Add Data</Button>
        </div>
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          Loading vault entries...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Vault</h1>
            <p className="text-muted-foreground mt-1">
              Your encrypted personal data storage
            </p>
          </div>
          <Button>Add Data</Button>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Error loading vault</CardTitle>
            <CardDescription className="text-red-800">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vault</h1>
          <p className="text-muted-foreground mt-1">
            Your encrypted personal data storage
          </p>
        </div>
        <Button>Add Data</Button>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No vault entries yet. Add your first data entry to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{entry.label}</CardTitle>
                    {entry.description && (
                      <CardDescription className="mt-1">
                        {entry.description}
                      </CardDescription>
                    )}
                  </div>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                    {entry.category}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
