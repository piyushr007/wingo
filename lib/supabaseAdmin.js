import { createClient } from '@supabase/supabase-js';

// Server-only client with the service role key. NEVER import this into
// client components — it must only be used inside app/api/* route handlers.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
