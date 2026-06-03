import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// SSR auth client bound to the request cookies. Used to read the logged-in user
// inside route handlers / server components. Auth only — data still goes through
// the service-role admin client.
export function createSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component / already-streamed response — safe to ignore;
            // the middleware refreshes the session cookie.
          }
        },
      },
    },
  );
}
