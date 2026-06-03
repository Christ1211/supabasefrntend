import { NextResponse } from 'next/server';
import { createSupabaseServer } from './supabase-server';

// Guard for API route handlers. Returns the user, or a 401 NextResponse to return early.
export async function requireUser() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, deny: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  return { user, deny: null as NextResponse | null };
}
