import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Use inside app/api/* route handlers to get the currently signed-in user
// (reads the Supabase auth cookie set by the browser client).
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // called from a Server Component - safe to ignore
          }
        },
        remove(name, options) {
          try {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          } catch {
            // ignore
          }
        },
      },
    }
  );
}
