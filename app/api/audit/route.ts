import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Mock audit log data
const mockAuditLogs = [
  {
    id: '1',
    eventType: 'data_created',
    action: 'Created vault entry: Personal Information',
    actorType: 'user',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    success: true,
  },
  {
    id: '2',
    eventType: 'consent_granted',
    action: 'Granted read access to Medical Research Institute',
    actorType: 'user',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    success: true,
  },
  {
    id: '3',
    eventType: 'access',
    action: 'Data accessed by Medical Research Institute',
    actorType: 'buyer',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    success: true,
  },
  {
    id: '4',
    eventType: 'consent_revoked',
    action: 'Revoked consent for General Hospital',
    actorType: 'user',
    timestamp: new Date().toISOString(),
    success: true,
  },
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(mockAuditLogs);
}
