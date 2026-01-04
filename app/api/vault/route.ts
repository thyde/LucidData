import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Mock vault data for placeholder implementation
const mockVaultData = [
  {
    id: '1',
    label: 'Personal Information',
    category: 'personal',
    dataType: 'json',
    description: 'Basic personal details',
    tags: ['identity', 'kyc'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    label: 'Health Records',
    category: 'health',
    dataType: 'json',
    description: 'Medical history',
    tags: ['health', 'medical'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '3',
    label: 'Financial Data',
    category: 'financial',
    dataType: 'json',
    description: 'Bank account information',
    tags: ['finance', 'banking'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

  // Return mock data for now
  return NextResponse.json(mockVaultData);
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
  console.log('Creating vault entry:', body);

  // Placeholder: just return success with mock data
  const newEntry = {
    id: Date.now().toString(),
    ...body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(newEntry, { status: 201 });
}
