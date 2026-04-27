// Browser Supabase client. Uses publishable (anon) key — RLS applies.
// Env vars are populated automatically when the Supabase connector is linked
// to this project in Lovable (Connectors → Supabase → Connect Project).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

if (!isSupabaseConfigured && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing. " +
      "Open this project in Lovable → Connectors → Supabase → Connect Project to link a Supabase project.",
  );
}

// Use safe placeholders so createClient doesn't throw at import time when the
// connector isn't linked yet. All auth/db calls will fail gracefully until
// real env vars are present.
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL ?? "https://placeholder.supabase.co",
  SUPABASE_PUBLISHABLE_KEY ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  },
);
