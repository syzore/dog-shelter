import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Browser-side Supabase client, scoped to the anon key and whatever RLS allows.
 *
 * Constructed lazily and memoized: building the client at module scope would
 * throw during `next build` on any machine without the env vars set, even for
 * pages that never touch Supabase.
 */
export function getSupabase(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      requireEnv(
        "NEXT_PUBLIC_SUPABASE_URL",
        process.env.NEXT_PUBLIC_SUPABASE_URL,
      ),
      requireEnv(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
    );
  }
  return cached;
}
