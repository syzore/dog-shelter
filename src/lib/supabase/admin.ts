import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS, so it must stay on the server — the
 * `server-only` import above turns any client-side import into a build error.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      requireEnv(
        "NEXT_PUBLIC_SUPABASE_URL",
        process.env.NEXT_PUBLIC_SUPABASE_URL,
      ),
      requireEnv(
        "SUPABASE_SERVICE_ROLE_KEY",
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}
