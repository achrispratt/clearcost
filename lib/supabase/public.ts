import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "./config";

let publicClient: SupabaseClient | null = null;

/**
 * Anonymous client with no cookies or session, for server-rendered pages that
 * are cached and shared by every visitor (the SEO price pages). Reading
 * cookies would make those pages per-request, so they can't use the server
 * client. RLS applies exactly as for a signed-out visitor.
 */
export function createPublicClient(): SupabaseClient {
  if (publicClient) return publicClient;
  const { url, key } = requireSupabaseConfig();
  publicClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return publicClient;
}
