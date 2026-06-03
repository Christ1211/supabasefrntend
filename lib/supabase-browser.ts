'use client';

import { createBrowserClient } from '@supabase/ssr';

// Browser auth client — uses the public anon key. Only used for sign-in / sign-out /
// reading the current session. Never used to query data (that goes through the
// server-side service-role API routes).
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
