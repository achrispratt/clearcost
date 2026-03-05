import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Checks auth and returns the user + supabase client, or an error response.
 *
 * Usage:
 *   const auth = await requireAuth();
 *   if ("error" in auth) return auth.error;
 *   const { supabase, user } = auth;
 */
export async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  return { supabase, user } as const;
}

/** Standardized API error handler. Logs and returns a consistent JSON error response. */
export function handleApiError(error: unknown, context: string) {
  console.error(`${context}:`, error);
  const message = error instanceof Error ? error.message : "An error occurred";
  return NextResponse.json({ error: message }, { status: 500 });
}
