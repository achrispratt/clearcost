const MISSING_CONFIG_MESSAGE =
  "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
  "Copy .env.local.example to .env.local and add your Supabase credentials.";

/** Returns Supabase config values (may be undefined). Use in middleware where missing config is non-fatal. */
export function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** Returns Supabase config values or throws if missing. Use in client/server where config is required. */
export function requireSupabaseConfig() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error(MISSING_CONFIG_MESSAGE);
  }
  return { url, key };
}
