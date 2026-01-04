import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Mock consent data
const mockConsents = [
  {
    id: '1',
    grantedTo: 'research-org-123',
    grantedToName: 'Medical Research Institute',
    accessLevel: 'read',
    purpose: 'Medical research study',
    revoked: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    grantedTo: 'healthcare-provider-456',
    grantedToName: 'General Hospital',
    accessLevel: 'export',
    purpose: 'Treatment coordination',
    revoked: true,
    revokedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
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

  return NextResponse.json(mockConsents);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  console.log('Granting consent:', body);

  const newConsent = {
    id: Date.now().toString(),
    ...body,
    revoked: false,
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json(newConsent, { status: 201 });
}
