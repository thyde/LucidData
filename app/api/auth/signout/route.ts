import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  await supabase.auth.signOut();

  const response = NextResponse.json({ success: true }, { status: 200 });
  
  // Clear auth cookies
  const cookieStore = request.headers.get('cookie') || '';
  const cookies = cookieStore.split(';').map((c) => c.trim());
  
  cookies.forEach((cookie) => {
    const [name] = cookie.split('=');
    if (name) {
      response.cookies.delete(name);
    }
  });

  return response;
}
