'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AuditEntry {
  id: string;
  eventType: string;
  action: string;
  actorType: string;
  timestamp: string;
  success: boolean;
}

interface AuditApiResponse {
  logs: AuditEntry[];
  chainValid: boolean;
  totalLogs: number;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to fetch audit logs
  const fetchAuditLogs = () => {
    fetch('/api/audit')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then((data: AuditApiResponse) => {
        setLogs(data.logs || []);
        setError(null);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching audit logs:', error);
        setError(error instanceof Error ? error.message : 'Failed to load audit logs');
        setLogs([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    // Initial fetch
    fetchAuditLogs();

    // Set up polling interval (5 seconds)
    // Only poll when the page is visible
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchAuditLogs();
      }
    }, 5000);

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground mt-1">
            Complete history of data access and modifications
          </p>
        </div>
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          Loading audit logs...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground mt-1">
            Complete history of data access and modifications
          </p>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Error loading audit log</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-800 mb-4">{error}</p>
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
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground mt-1">
          Complete history of data access and modifications
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>No audit logs yet. Your data access history will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  data-testid="audit-entry"
                  role="article"
                  className="flex items-start space-x-4 border-l-2 border-blue-500 pl-4 py-2"
                >
                  <div className="flex-1">
                    <p className="font-medium">{log.action}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                      <span>•</span>
                      <span className="capitalize">{log.eventType.replace('_', ' ')}</span>
                      <span>•</span>
                      <span className="capitalize">{log.actorType}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      log.success
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {log.success ? 'Success' : 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
